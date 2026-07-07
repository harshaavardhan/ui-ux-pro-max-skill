import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact, hasRole } from "@/lib/access.js";
import { randomId, sha256Hex } from "@/lib/crypto.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Save a new immutable version (editors and owners only, members only).
export const POST = handler(async (req, { params }) => {
  const user = requireUser();
  const artifact = getArtifact(params.id);
  if (!artifact) return fail("not found", 404);
  const role = userRoleForArtifact(user, artifact);
  if (!hasRole(role, "editor")) return fail("editor access required", 403);

  const { html, note } = await req.json();
  if (!html || !String(html).trim()) return fail("HTML content required");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES)
    return fail("HTML exceeds 2 MB limit", 413);

  const digest = sha256Hex(html);
  const versionId = randomId("ver");
  let versionNumber;

  const tx = db.transaction(() => {
    const last = db
      .prepare(
        "SELECT MAX(version_number) AS n FROM versions WHERE artifact_id = ?"
      )
      .get(artifact.id);
    versionNumber = (last?.n || 0) + 1;
    db.prepare(
      `INSERT INTO versions (id, artifact_id, version_number, author_id, html, sha256, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(versionId, artifact.id, versionNumber, user.id, html, digest, String(note || ""));
    db.prepare("UPDATE artifacts SET current_version_id = ? WHERE id = ?").run(
      versionId,
      artifact.id
    );
  });
  tx();

  audit(
    artifact.id,
    user.email,
    "version_saved",
    `v${versionNumber} sha256=${digest.slice(0, 16)}`
  );
  return json({ ok: true, versionId, versionNumber, sha256: digest });
});
