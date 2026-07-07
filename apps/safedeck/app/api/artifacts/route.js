import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { randomId, sha256Hex } from "@/lib/crypto.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB

export const GET = handler(async () => {
  const user = requireUser();
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.created_at, a.owner_id,
              u.name AS owner_name,
              v.version_number, v.sha256, v.created_at AS updated_at,
              CASE WHEN a.owner_id = @uid THEN 'owner' ELSE p.role END AS role
       FROM artifacts a
       JOIN users u ON u.id = a.owner_id
       LEFT JOIN versions v ON v.id = a.current_version_id
       LEFT JOIN permissions p ON p.artifact_id = a.id AND p.user_id = @uid
       WHERE a.owner_id = @uid OR p.user_id = @uid
       ORDER BY COALESCE(v.created_at, a.created_at) DESC`
    )
    .all({ uid: user.id });
  return json({ artifacts: rows });
});

export const POST = handler(async (req) => {
  const user = requireUser();
  const { title, html, note } = await req.json();
  if (!title || !String(title).trim()) return fail("title required");
  if (!html || !String(html).trim()) return fail("HTML content required");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES)
    return fail("HTML exceeds 2 MB limit", 413);

  const artifactId = randomId("art");
  const versionId = randomId("ver");
  const digest = sha256Hex(html);

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO artifacts (id, org_id, owner_id, title) VALUES (?, ?, ?, ?)"
    ).run(artifactId, user.org_id, user.id, String(title).trim());
    db.prepare(
      `INSERT INTO versions (id, artifact_id, version_number, author_id, html, sha256, note)
       VALUES (?, ?, 1, ?, ?, ?, ?)`
    ).run(versionId, artifactId, user.id, html, digest, String(note || "Initial version"));
    db.prepare("UPDATE artifacts SET current_version_id = ? WHERE id = ?").run(
      versionId,
      artifactId
    );
  });
  tx();

  audit(artifactId, user.email, "artifact_created", `v1 sha256=${digest.slice(0, 16)}`);
  return json({ ok: true, id: artifactId, sha256: digest });
});
