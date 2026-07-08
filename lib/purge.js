import db, { PUBLIC_USER_ID } from "./db.js";

// Auto-deletion for anonymous quick shares: once every share link on a
// public-account artifact has expired (or been revoked), the artifact and
// ALL its data — versions (content), links, comments, audit rows — are
// permanently deleted. This backs the front-page promise that anonymous
// content is not kept after expiry. Called lazily from the quick-share and
// share-resolution paths, so no cron is required.
export function purgeExpiredQuickShares() {
  const dead = db
    .prepare(
      `SELECT a.id FROM artifacts a
       WHERE a.owner_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM share_links l
           WHERE l.artifact_id = a.id
             AND l.revoked = 0
             AND (l.expires_at IS NULL OR datetime(l.expires_at) > datetime('now'))
         )`
    )
    .all(PUBLIC_USER_ID);
  if (dead.length === 0) return 0;

  const wipe = db.transaction((ids) => {
    const del = (sql) => {
      const stmt = db.prepare(sql);
      for (const { id } of ids) stmt.run(id);
    };
    del("DELETE FROM comments WHERE artifact_id = ?");
    del("DELETE FROM audit_log WHERE artifact_id = ?");
    del("DELETE FROM magic_tokens WHERE share_link_id IN (SELECT id FROM share_links WHERE artifact_id = ?)");
    del("DELETE FROM share_links WHERE artifact_id = ?");
    del("DELETE FROM edit_locks WHERE artifact_id = ?");
    del("UPDATE artifacts SET current_version_id = NULL WHERE id = ?");
    del("DELETE FROM versions WHERE artifact_id = ?");
    del("DELETE FROM artifacts WHERE id = ?");
  });
  wipe(dead);
  return dead.length;
}
