import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact, hasRole } from "@/lib/access.js";
import { insertVersion } from "@/lib/versions.js";
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

  let versionNumber;
  let created;
  const tx = db.transaction(() => {
    const last = db
      .prepare(
        "SELECT MAX(version_number) AS n FROM versions WHERE artifact_id = ?"
      )
      .get(artifact.id);
    versionNumber = (last?.n || 0) + 1;
    created = insertVersion({
      artifactId: artifact.id,
      versionNumber,
      authorId: user.id,
      html,
      note: String(note || ""),
    });
    db.prepare("UPDATE artifacts SET current_version_id = ? WHERE id = ?").run(
      created.id,
      artifact.id
    );
  });
  tx();

  audit(
    artifact.id,
    user.email,
    "version_saved",
    `v${versionNumber} sha256=${created.sha256.slice(0, 16)}`
  );
  return json({ ok: true, versionId: created.id, versionNumber, sha256: created.sha256 });
});
