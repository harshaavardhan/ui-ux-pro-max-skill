import db from "@/lib/db.js";
import { resolveAccess } from "@/lib/access.js";
import { sha256Hex } from "@/lib/crypto.js";
import { audit } from "@/lib/audit.js";
import { handler } from "@/lib/api.js";

// SafeDeck Artifact Protocol — render endpoint.
//
// 1. Access: requires a member session with a role on the artifact, or a
//    valid share link (?link=<token>); recipient-bound links additionally
//    require the signed grant cookie set by magic-link verification.
// 2. Integrity: the stored HTML is re-hashed on EVERY request and compared
//    to the digest recorded at save time. Mismatch → 409, never served.
// 3. Containment: the response carries a CSP that blocks all external
//    network access; the client embeds it in <iframe sandbox="allow-scripts">
//    (no allow-same-origin), so the artifact runs in an opaque origin.
const ARTIFACT_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

function htmlError(status, title, message) {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;padding:3rem;color:#0f172a;background:#fef2f2">
     <h2 style="color:#dc2626">${title}</h2><p>${message}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const GET = handler(async (req, { params }) => {
  const version = db
    .prepare("SELECT * FROM versions WHERE id = ?")
    .get(params.versionId);
  if (!version) return htmlError(404, "Not found", "This artifact version does not exist.");

  const linkToken = new URL(req.url).searchParams.get("link");
  const access = resolveAccess(version.artifact_id, linkToken);
  if (!access)
    return htmlError(
      403,
      "Access denied",
      "You do not have permission to view this artifact, or the share link is expired or revoked."
    );

  // Tamper-evidence: verify content hash before serving.
  const digest = sha256Hex(version.html);
  if (digest !== version.sha256) {
    audit(
      version.artifact_id,
      access.actor,
      "integrity_failure",
      `v${version.version_number} expected ${version.sha256.slice(0, 16)} got ${digest.slice(0, 16)}`
    );
    return htmlError(
      409,
      "Integrity violation",
      "The stored content no longer matches its recorded SHA-256 fingerprint. Serving has been blocked and the owner has been notified via the audit log."
    );
  }

  audit(
    version.artifact_id,
    access.actor,
    "viewed",
    `v${version.version_number} via ${access.via}`
  );

  return new Response(version.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": ARTIFACT_CSP,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
      "X-SafeDeck-SHA256": version.sha256,
      "X-SafeDeck-Version": String(version.version_number),
    },
  });
});
