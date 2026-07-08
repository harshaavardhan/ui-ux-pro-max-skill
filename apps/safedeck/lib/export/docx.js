// DOCX exporter — pure Node module (no db / Next imports).
//
// Converts deck HTML to a Word document via html-to-docx, then injects
// MS Purview-compatible (MSIP) custom document properties with jszip so DLP
// tooling can read the sensitivity classification from the Office metadata.

import HTMLtoDOCX from "html-to-docx";
import JSZip from "jszip";
import { xmlEscape, msipProperties } from "./label-meta.js";

const CUSTOM_XML_PATH = "docProps/custom.xml";
const CUSTOM_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.custom-properties+xml";
const CUSTOM_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties";
const CUSTOM_FMTID = "{D5CDD505-2E9C-101B-9397-08002B2CF9AE}";

// Pull every <style> block out of the document (head or body). html-to-docx
// applies inline styles reliably but not full stylesheets — keeping the
// blocks is harmless and helps processors that do read them.
function extractStyleBlocks(html) {
  const out = [];
  const re = /<style[^>]*>[\s\S]*?<\/style>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[0]);
  return out.join("\n");
}

// Grab the <body> inner HTML; fall back to the whole string for fragments.
function extractBodyInner(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

// Build the DOCX-ready HTML string: styles + optional classification
// marking paragraph + body content. Inline style attributes are preserved
// verbatim (html-to-docx honours text-align, font-size, color,
// background-color, font-weight, margins).
function buildDocxHtml(html, label) {
  const styles = extractStyleBlocks(html);
  const body = extractBodyInner(html);
  const marking = label
    ? `<p style="color:${xmlEscape(label.color)};font-weight:bold;">[${xmlEscape(
        label.name
      )}]</p>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>${marking}${body}</body></html>`;
}

// ---- MSIP custom-property injection via jszip ----

function buildCustomXml(props) {
  const entries = Object.entries(props);
  const body = entries
    .map(([key, value], i) => {
      const pid = i + 2; // pids start at 2 (1 is reserved)
      return (
        `<property fmtid="${CUSTOM_FMTID}" pid="${pid}" name="${xmlEscape(key)}">` +
        `<vt:lpwstr>${xmlEscape(value)}</vt:lpwstr></property>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `${body}</Properties>`
  );
}

function ensureContentTypeOverride(xml) {
  if (xml.includes(`PartName="/${CUSTOM_XML_PATH}"`)) return xml;
  const override = `<Override PartName="/${CUSTOM_XML_PATH}" ContentType="${CUSTOM_CONTENT_TYPE}"/>`;
  return xml.replace(/<\/Types>\s*$/, `${override}</Types>`);
}

function ensureRootRelationship(xml) {
  if (xml.includes(`Target="${CUSTOM_XML_PATH}"`) || xml.includes(CUSTOM_REL_TYPE)) {
    return xml;
  }
  // Pick a fresh, unique relationship id.
  const ids = [...xml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  const nextId = (ids.length ? Math.max(...ids) : 0) + 1;
  const rel = `<Relationship Id="rId${nextId}" Type="${CUSTOM_REL_TYPE}" Target="${CUSTOM_XML_PATH}"/>`;
  return xml.replace(/<\/Relationships>\s*$/, `${rel}</Relationships>`);
}

async function injectMsipProperties(buffer, props) {
  const zip = await JSZip.loadAsync(buffer);

  zip.file(CUSTOM_XML_PATH, buildCustomXml(props));

  const ctFile = zip.file("[Content_Types].xml");
  if (ctFile) {
    const ct = await ctFile.async("string");
    zip.file("[Content_Types].xml", ensureContentTypeOverride(ct));
  }

  const relsFile = zip.file("_rels/.rels");
  if (relsFile) {
    const rels = await relsFile.async("string");
    zip.file("_rels/.rels", ensureRootRelationship(rels));
  }

  return zip.generateAsync({ type: "nodebuffer" });
}

/**
 * Convert deck HTML to a DOCX Buffer.
 * @param {string} html full HTML document for the deck
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {object|null} [opts.label] sensitivity label row (name, color, guid)
 * @returns {Promise<Buffer>}
 */
export async function htmlToDocxBuffer(html, { title, label } = {}) {
  const docHtml = buildDocxHtml(html, label);

  const headerHtml = label
    ? `<p style="text-align:center;font-weight:bold;">${xmlEscape(label.name)}</p>`
    : null;

  const options = {
    title: title || "ShareLock Export",
    orientation: "landscape",
    margins: { top: 720, right: 720, bottom: 720, left: 720 },
    table: { row: { cantSplit: true } },
    footer: false,
    header: !!label,
  };
  if (label) options.subject = `Sensitivity: ${label.name}`;

  const result = await HTMLtoDOCX(docHtml, headerHtml, options, null);
  let buffer = Buffer.isBuffer(result) ? result : Buffer.from(result);

  if (label) {
    const props = msipProperties(label);
    if (Object.keys(props).length) {
      buffer = await injectMsipProperties(buffer, props);
    }
  }
  return buffer;
}
