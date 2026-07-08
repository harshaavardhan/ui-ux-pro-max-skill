import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact, hasRole } from "@/lib/access.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const STALE_SECONDS = 90;

function lockState(artifactId) {
  const row = db
    .prepare(
      `SELECT l.*, u.name AS holder_name, u.email AS holder_email,
              (strftime('%s','now') - strftime('%s', l.heartbeat_at)) AS age
       FROM edit_locks l JOIN users u ON u.id = l.user_id
       WHERE l.artifact_id = ?`
    )
    .get(artifactId);
  if (!row) return null;
  return { ...row, stale: row.age > STALE_SECONDS };
}

export const GET = handler(async (req, { params }) => {
  const user = requireUser();
  const artifact = getArtifact(params.id);
  if (!artifact) return fail("not found", 404);
  if (!hasRole(userRoleForArtifact(user, artifact), "editor"))
    return fail("editor access required", 403);
  return json({ lock: lockState(artifact.id) });
});

// Acquire / heartbeat / take over the soft edit lock.
export const POST = handler(async (req, { params }) => {
  const user = requireUser();
  const artifact = getArtifact(params.id);
  if (!artifact) return fail("not found", 404);
  if (!hasRole(userRoleForArtifact(user, artifact), "editor"))
    return fail("editor access required", 403);

  const { takeover } = await req.json().catch(() => ({}));
  const existing = lockState(artifact.id);

  if (existing && existing.user_id !== user.id && !existing.stale && !takeover) {
    return json({ ok: false, lock: existing }, 409);
  }
  if (existing && existing.user_id !== user.id && takeover) {
    audit(artifact.id, user.email, "lock_takeover", `from ${existing.holder_email}`);
  }
  db.prepare(
    `INSERT INTO edit_locks (artifact_id, user_id, acquired_at, heartbeat_at)
     VALUES (?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(artifact_id) DO UPDATE SET
       user_id = excluded.user_id,
       acquired_at = CASE WHEN edit_locks.user_id = excluded.user_id THEN edit_locks.acquired_at ELSE excluded.acquired_at END,
       heartbeat_at = datetime('now')`
  ).run(artifact.id, user.id);
  return json({ ok: true, lock: lockState(artifact.id) });
});

export const DELETE = handler(async (req, { params }) => {
  const user = requireUser();
  const artifact = getArtifact(params.id);
  if (!artifact) return fail("not found", 404);
  db.prepare("DELETE FROM edit_locks WHERE artifact_id = ? AND user_id = ?").run(
    artifact.id,
    user.id
  );
  return json({ ok: true });
});
