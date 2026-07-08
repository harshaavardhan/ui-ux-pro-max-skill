// Standalone exporter test — does NOT hit the HTTP server.
// Run from the app dir:  node scripts/test-export.mjs
//
// Feeds a 3-section sample deck (gradients + inline styles + a right-aligned
// paragraph) through the PDF and DOCX exporters directly, writes the outputs
// to /tmp, and asserts structural + metadata fidelity.

import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

const { htmlToPdf, closePdfBrowser } = await import(
  path.join(appDir, "lib/export/pdf.js")
);
const { htmlToDocxBuffer } = await import(path.join(appDir, "lib/export/docx.js"));

const label = {
  guid: "11111111-2222-3333-4444-555555555555",
  name: "Confidential",
  color: "#b45309",
  watermark: 1,
};

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin: 0; font-family: Arial, sans-serif; }
  section { padding: 48px; }
</style>
</head>
<body>
  <section style="background:linear-gradient(135deg,#4f46e5,#06b6d4);color:#fff;">
    <h1 style="font-size:40px;font-weight:800;">Slide One</h1>
    <p style="font-size:18px;">Gradient background with light text.</p>
  </section>
  <section style="background:linear-gradient(135deg,#b45309,#f59e0b);color:#111;">
    <h2 style="font-size:32px;">Slide Two</h2>
    <p style="text-align:right;font-weight:bold;">Right-aligned paragraph.</p>
  </section>
  <section style="background:#0f172a;color:#e2e8f0;">
    <h2 style="font-size:32px;">Slide Three</h2>
    <p style="font-size:16px;">Dark closing slide.</p>
  </section>
</body>
</html>`;

let failures = 0;
function check(name, ok, extra = "") {
  if (ok) {
    console.log(`PASS: ${name}${extra ? " — " + extra : ""}`);
  } else {
    console.log(`FAIL: ${name}${extra ? " — " + extra : ""}`);
    failures++;
  }
}

// ---------------- PDF ----------------
try {
  const pdf = await htmlToPdf(html, {
    title: "Test Deck",
    label,
    watermarkText: `${label.name} · tester@example.com`,
    paper: "A4",
    orientation: "landscape",
  });
  fs.writeFileSync("/tmp/test.pdf", pdf);

  check("PDF starts with %PDF", pdf.slice(0, 4).toString("latin1") === "%PDF");

  const doc = await PDFDocument.load(pdf);
  const pages = doc.getPageCount();
  check("PDF page count === 3", pages === 3, `got ${pages}`);

  const kw = doc.getKeywords() || "";
  check(
    "PDF keywords carry MSIP label",
    kw.includes("MSIP_Label_11111111") && kw.includes("Confidential"),
    kw.slice(0, 80)
  );
  const subj = doc.getSubject() || "";
  check("PDF subject notes sensitivity", subj.includes("Confidential"), subj);
} catch (err) {
  check("PDF export threw", false, err && err.stack ? err.stack : String(err));
}

// ---------------- DOCX ----------------
try {
  const docx = await htmlToDocxBuffer(html, { title: "Test Deck", label });
  fs.writeFileSync("/tmp/test.docx", docx);

  const zip = await JSZip.loadAsync(docx);

  check("DOCX word/document.xml exists", !!zip.file("word/document.xml"));

  const customFile = zip.file("docProps/custom.xml");
  check("DOCX docProps/custom.xml exists", !!customFile);
  if (customFile) {
    const custom = await customFile.async("string");
    check(
      "DOCX custom.xml contains MSIP label + name",
      custom.includes("MSIP_Label_11111111") && custom.includes("Confidential"),
      ""
    );
  }

  const ctFile = zip.file("[Content_Types].xml");
  const ct = ctFile ? await ctFile.async("string") : "";
  check(
    "DOCX [Content_Types].xml has custom-properties override",
    ct.includes("custom-properties+xml") && ct.includes("/docProps/custom.xml")
  );

  const relsFile = zip.file("_rels/.rels");
  const rels = relsFile ? await relsFile.async("string") : "";
  check(
    "DOCX _rels/.rels references custom.xml",
    rels.includes("custom-properties") && rels.includes("docProps/custom.xml")
  );
} catch (err) {
  check("DOCX export threw", false, err && err.stack ? err.stack : String(err));
}

await closePdfBrowser().catch(() => {});

console.log("");
if (failures === 0) {
  console.log("ALL CHECKS PASSED");
  process.exit(0);
} else {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
