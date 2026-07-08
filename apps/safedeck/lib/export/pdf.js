// PDF exporter — pure Node module (no db / Next imports).
//
// Renders deck HTML to a print-fidelity PDF via headless Chromium
// (playwright-core), then post-processes the file with pdf-lib to stamp
// document metadata and DLP-scannable sensitivity keywords.
//
// Each top-level <section> in <body> becomes exactly one PDF page. When a
// sensitivity label carries a watermark, a fixed diagonal watermark overlay
// and a coloured classification banner are injected (export-only nodes,
// id-prefixed `sd-export-` so the stored source is never modified).

import fs from "fs";
import { chromium } from "playwright-core";
import { PDFDocument } from "pdf-lib";
import { xmlEscape, msipKeyValuePairs, msipProperties } from "./label-meta.js";
import { APP_NAME } from "../constants.js";

// Candidate Chromium binaries, in resolution order.
const CHROMIUM_CANDIDATES = [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
];

function resolveExecutablePath() {
  if (process.env.SHARELOCK_CHROMIUM_PATH) return process.env.SHARELOCK_CHROMIUM_PATH;
  for (const p of CHROMIUM_CANDIDATES) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return undefined; // let playwright try its bundled default
}

// Reuse one browser across exports — launching Chromium is expensive.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        executablePath: resolveExecutablePath(),
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      })
      .catch((err) => {
        // Reset so a later call can retry a failed launch.
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

// Print stylesheet: one deck <section> per physical page, backgrounds kept.
function printCss(paper, orientation) {
  return `
    @page { size: ${paper} ${orientation}; margin: 0; }
    html, body { margin: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body > section {
      page-break-after: always;
      break-after: page;
      /* No min-height: forcing 100vh makes sections overflow the page box
         (fractional rounding) and doubles the page count with blanks.
         Short sections simply leave whitespace, which prints correctly. */
      box-sizing: border-box;
      max-height: 100vh;
      overflow: hidden;
    }
    body > section:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }
  `;
}

// A repeating diagonal watermark tile as a data-URI SVG background.
function watermarkDataUri(text) {
  const safe = xmlEscape(text);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260">` +
    `<text x="50%" y="50%" transform="rotate(-30 210 130)" ` +
    `text-anchor="middle" dominant-baseline="middle" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="34" ` +
    `font-weight="700" fill="#111111">${safe}</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Inject the watermark overlay + classification banner into the live page.
async function injectOverlay(page, { labelName, labelColor, watermarkText }) {
  const uri = watermarkDataUri(watermarkText);
  await page.evaluate(
    ({ uri, labelName, labelColor }) => {
      const OVERLAY = "sd-export-watermark";
      const BANNER = "sd-export-banner";
      // Fixed elements repeat on every printed page in Chromium — exactly
      // what we want for a per-page classification marking.
      const wm = document.createElement("div");
      wm.id = OVERLAY;
      wm.setAttribute("aria-hidden", "true");
      wm.style.cssText = [
        "position:fixed",
        "inset:0",
        "pointer-events:none",
        "z-index:2147483647",
        "opacity:0.13",
        `background-image:url("${uri}")`,
        "background-repeat:repeat",
        "background-position:center",
      ].join(";");
      document.body.appendChild(wm);

      const banner = document.createElement("div");
      banner.id = BANNER;
      banner.textContent = labelName;
      banner.style.cssText = [
        "position:fixed",
        "top:0",
        "left:0",
        "right:0",
        "height:20px",
        "line-height:20px",
        "text-align:center",
        "font-family:Arial, Helvetica, sans-serif",
        "font-size:11px",
        "font-weight:700",
        "letter-spacing:0.08em",
        "text-transform:uppercase",
        "color:#ffffff",
        `background:${labelColor || "#334155"}`,
        "pointer-events:none",
        "z-index:2147483647",
      ].join(";");
      document.body.appendChild(banner);
    },
    { uri, labelName, labelColor }
  );
}

/**
 * Render deck HTML to a PDF Buffer.
 * @param {string} html full HTML document for the deck
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {object|null} [opts.label] sensitivity label row (name, color, guid, watermark)
 * @param {string|null} [opts.watermarkText] explicit watermark text (overrides label.name)
 * @param {string} [opts.paper] "A4" | "Letter"
 * @param {string} [opts.orientation] "portrait" | "landscape"
 * @returns {Promise<Buffer>}
 */
export async function htmlToPdf(
  html,
  { title, label, watermarkText, paper = "A4", orientation = "landscape" } = {}
) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  let pdfBytes;
  try {
    try {
      await page.setContent(html, { waitUntil: "networkidle", timeout: 15000 });
    } catch {
      // Decks with no external assets may never reach networkidle — a plain
      // load event is enough for a local render.
      await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    }

    await page.addStyleTag({ content: printCss(paper, orientation) });

    const wantWatermark = !!(label && (label.watermark || watermarkText));
    if (wantWatermark) {
      await injectOverlay(page, {
        labelName: label.name || "",
        labelColor: label.color,
        watermarkText: watermarkText || label.name || "Confidential",
      });
    }

    // Give the print media / injected backgrounds a beat to settle.
    await page.emulateMedia({ media: "print" }).catch(() => {});

    pdfBytes = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }

  // ---- Post-process metadata with pdf-lib ----
  const doc = await PDFDocument.load(pdfBytes);
  doc.setTitle(title || `${APP_NAME} Export`);
  doc.setCreator(APP_NAME);
  doc.setProducer(`${APP_NAME} Export`);
  if (label) {
    doc.setSubject(`Sensitivity: ${label.name}`);
    // Embed each MSIP property as a "key=value" keyword so DLP keyword
    // scanners can detect the sensitivity classification.
    doc.setKeywords(msipKeyValuePairs(msipProperties(label)));
  }
  const out = await doc.save();
  return Buffer.from(out);
}

// Best-effort shutdown (used by long-running processes / tests).
export async function closePdfBrowser() {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      /* ignore */
    } finally {
      browserPromise = null;
    }
  }
}
