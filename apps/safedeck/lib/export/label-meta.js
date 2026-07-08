// Pure helpers shared by the PDF and DOCX exporters.
// No Next.js / db imports here — keep these importable directly under Node.

// Escape a string for safe insertion into XML text/attribute content.
export function xmlEscape(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// MSIP-compatible property set for exports — a pure mirror of
// lib/labels.js#msipProperties, duplicated here so the PDF/DOCX exporters
// stay free of the db-backed labels module and remain importable under plain
// Node. Keep this in sync with lib/labels.js if the label schema changes.
export function msipProperties(label, { siteId = "" } = {}) {
  if (!label) return {};
  const g = label.guid;
  return {
    [`MSIP_Label_${g}_Enabled`]: "true",
    [`MSIP_Label_${g}_Name`]: label.name,
    [`MSIP_Label_${g}_Method`]: "Privileged",
    [`MSIP_Label_${g}_SetDate`]: new Date().toISOString(),
    [`MSIP_Label_${g}_SiteId`]: siteId,
    ShareLock_Sensitivity: label.name,
  };
}

// Turn an MSIP property map ({ KEY: VALUE, ... }) into "KEY=VALUE" strings.
// DLP keyword scanners look for exactly these tokens, so they are embedded
// verbatim in PDF keywords and DOCX custom properties.
export function msipKeyValuePairs(props) {
  if (!props) return [];
  return Object.entries(props).map(([k, v]) => `${k}=${v}`);
}
