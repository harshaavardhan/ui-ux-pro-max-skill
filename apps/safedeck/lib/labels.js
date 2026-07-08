import db from "./db.js";
import { randomId, randomUuid } from "./crypto.js";

// Default Purview-style taxonomy seeded for every new organization.
// rank orders sensitivity; policy fields are enforced server-side.
const DEFAULTS = [
  { name: "Public",              color: "#059669", rank: 0, watermark: 0, allow_external: 1, allow_signed: 1, allow_ai: 1, max_expiry_days: null },
  { name: "Internal",            color: "#2563eb", rank: 1, watermark: 0, allow_external: 1, allow_signed: 1, allow_ai: 1, max_expiry_days: 90 },
  { name: "Confidential",        color: "#b45309", rank: 2, watermark: 1, allow_external: 1, allow_signed: 0, allow_ai: 1, max_expiry_days: 30 },
  { name: "Highly Confidential", color: "#dc2626", rank: 3, watermark: 1, allow_external: 0, allow_signed: 0, allow_ai: 0, max_expiry_days: 7 },
];

export function seedDefaultLabels(orgId) {
  const existing = db.prepare("SELECT COUNT(*) c FROM labels WHERE org_id = ?").get(orgId);
  if (existing.c > 0) return;
  const ins = db.prepare(
    `INSERT INTO labels (id, org_id, guid, name, color, rank, watermark, allow_external, allow_signed, allow_ai, max_expiry_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const l of DEFAULTS) {
    ins.run(randomId("lbl"), orgId, randomUuid(), l.name, l.color, l.rank, l.watermark, l.allow_external, l.allow_signed, l.allow_ai, l.max_expiry_days);
  }
}

export function getLabel(labelId) {
  if (!labelId) return null;
  return db.prepare("SELECT * FROM labels WHERE id = ?").get(labelId) || null;
}

export function getArtifactLabel(artifact) {
  return getLabel(artifact?.label_id);
}

// Policy checks — return an error message when the action is forbidden by
// the artifact's label, or null when allowed. Unlabeled = unrestricted.
export function checkShareAllowed(label, mode) {
  if (!label) return null;
  if (!label.allow_external)
    return `“${label.name}” content cannot be shared via links — grant named users a role instead`;
  if (mode === "signed" && !label.allow_signed)
    return `“${label.name}” content requires recipient-bound links (anyone-with-link sharing is disabled by policy)`;
  return null;
}

export function clampExpiry(label, expiresAt) {
  if (!label || !label.max_expiry_days) return expiresAt;
  const max = new Date(Date.now() + label.max_expiry_days * 864e5);
  if (!expiresAt) return max.toISOString();
  const requested = new Date(expiresAt);
  return (requested > max ? max : requested).toISOString();
}

export function checkAiAllowed(label) {
  if (!label) return null;
  if (!label.allow_ai)
    return `AI editing is disabled for “${label.name}” content — its policy keeps content from leaving ShareLock`;
  return null;
}

// MSIP-compatible property set for exports (what MS Purview writes into
// Office files). setDate/method mirror the real convention.
export function msipProperties(label, { siteId = "" } = {}) {
  if (!label) return {};
  const g = label.guid;
  return {
    [`MSIP_Label_${g}_Enabled`]: "true",
    [`MSIP_Label_${g}_Name`]: label.name,
    [`MSIP_Label_${g}_Method`]: "Privileged",
    [`MSIP_Label_${g}_SetDate`]: new Date().toISOString(),
    [`MSIP_Label_${g}_SiteId`]: siteId,
    "ShareLock_Sensitivity": label.name,
  };
}
