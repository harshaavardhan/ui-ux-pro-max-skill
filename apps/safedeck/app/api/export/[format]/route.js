import db from "@/lib/db.js";
import { resolveAccess } from "@/lib/access.js";
import { sha256Hex } from "@/lib/crypto.js";
import { getVersionHtml } from "@/lib/versions.js";
import { getArtifactLabel } from "@/lib/labels.js";
import { audit } from "@/lib/audit.js";
import { fail, handler } from "@/lib/api.js";
import { htmlToPdf } from "@/lib/export/pdf.js";
import { htmlToDocxBuffer } from "@/lib/export/docx.js";

export const dynamic = "force-dynamic";

const PAPERS = new Set(["A4", "Letter"]);
const ORIENTATIONS = new Set(["portrait", "landscape"]);

const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Derive a safe download filename from the artifact title.
function safeFilename(title, ext) {
  const base =
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9-_ ]/g, "")
      .trim()
      .replace(/\s+/g, " ") || "artifact";
  return `${base}.${ext}`;
}

export const GET = handler(async (req, { params }) => {
  const format = params.format;
  if (format !== "pdf" && format !== "docx") return fail("unsupported format", 400);

  const url = new URL(req.url);
  const artifactId = url.searchParams.get("artifact");
  if (!artifactId) return fail("artifact required", 400);
  const linkToken = url.searchParams.get("link");

  const paper = url.searchParams.get("paper") || "A4";
  const orientation = url.searchParams.get("orientation") || "landscape";
  if (!PAPERS.has(paper)) return fail("invalid paper", 400);
  if (!ORIENTATIONS.has(orientation)) return fail("invalid orientation", 400);

  // Access: viewer role (via member session or share link) is enough to export.
  const access = resolveAccess(artifactId, linkToken);
  if (!access) return fail("no access", 404);

  // Resolve the version — default to the artifact's current version.
  const versionId =
    url.searchParams.get("version") || access.artifact.current_version_id;
  if (!versionId) return fail("no version", 404);
  const version = db
    .prepare("SELECT * FROM versions WHERE id = ? AND artifact_id = ?")
    .get(versionId, artifactId);
  if (!version) return fail("version not found", 404);

  // Integrity: decrypt then verify the plaintext hash before exporting.
  let html;
  try {
    html = getVersionHtml(version);
  } catch {
    audit(artifactId, access.actor, "integrity_failure", `export decrypt v${version.version_number}`);
    return fail("integrity check failed", 409);
  }
  if (sha256Hex(html) !== version.sha256) {
    audit(artifactId, access.actor, "integrity_failure", `export hash v${version.version_number}`);
    return fail("integrity check failed", 409);
  }

  const label = getArtifactLabel(access.artifact);
  const watermarkText = label?.watermark ? `${label.name} · ${access.actor}` : null;
  const title = access.artifact.title;

  let buffer;
  if (format === "pdf") {
    buffer = await htmlToPdf(html, { title, label, watermarkText, paper, orientation });
  } else {
    buffer = await htmlToDocxBuffer(html, { title, label });
  }

  audit(artifactId, access.actor, "exported", `${format} v${version.version_number}`);

  const filename = safeFilename(title, format);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
