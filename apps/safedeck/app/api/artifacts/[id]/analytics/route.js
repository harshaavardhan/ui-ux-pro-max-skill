import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact } from "@/lib/access.js";
import { json, fail, handler } from "@/lib/api.js";

export const dynamic = "force-dynamic";

function channelForDetail(detail) {
  const d = detail || "";
  if (d.includes("via member")) return "Members";
  if (d.includes("via signed-link")) return "Anyone-with-link";
  if (d.includes("via recipient-link")) return "Verified recipients";
  return "Other";
}

// Fill any missing days in the last 30 with zero views.
function fillDays(rows) {
  const byDay = new Map(rows.map((r) => [r.day, r.views]));
  const out = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, views: byDay.get(day) || 0 });
  }
  return out;
}

export const GET = handler(async (req, { params }) => {
  const user = requireUser();
  const artifact = getArtifact(params.id);
  if (!artifact) return fail("not found", 404);
  if (userRoleForArtifact(user, artifact) !== "owner")
    return fail("owner access required", 403);

  const artifactId = artifact.id;

  const viewsRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE artifact_id = ? AND action = 'viewed'`
    )
    .get(artifactId);
  const uniqueViewersRow = db
    .prepare(
      `SELECT COUNT(DISTINCT actor) AS n FROM audit_log WHERE artifact_id = ? AND action = 'viewed'`
    )
    .get(artifactId);
  const exportsRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE artifact_id = ? AND action = 'exported'`
    )
    .get(artifactId);
  const aiEditsRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE artifact_id = ? AND action = 'ai_edit'`
    )
    .get(artifactId);
  const versionsSavedRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE artifact_id = ? AND action = 'version_saved'`
    )
    .get(artifactId);
  const commentsRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE artifact_id = ? AND action = 'comment_added'`
    )
    .get(artifactId);
  const lastActivityRow = db
    .prepare(
      `SELECT MAX(created_at) AS ts FROM audit_log WHERE artifact_id = ?`
    )
    .get(artifactId);

  const totals = {
    views: viewsRow.n,
    uniqueViewers: uniqueViewersRow.n,
    exports: exportsRow.n,
    aiEdits: aiEditsRow.n,
    versions: versionsSavedRow.n + 1,
    comments: commentsRow.n,
    lastActivity: lastActivityRow.ts || null,
  };

  const viewsByDayRaw = db
    .prepare(
      `SELECT date(created_at) AS day, COUNT(*) AS views
       FROM audit_log
       WHERE artifact_id = ? AND action = 'viewed' AND date(created_at) >= date('now', '-29 days')
       GROUP BY date(created_at)`
    )
    .all(artifactId);
  const viewsByDay = fillDays(viewsByDayRaw);

  const viewedRows = db
    .prepare(
      `SELECT detail FROM audit_log WHERE artifact_id = ? AND action = 'viewed'`
    )
    .all(artifactId);
  const channelCounts = { Members: 0, "Verified recipients": 0, "Anyone-with-link": 0 };
  for (const row of viewedRows) {
    const ch = channelForDetail(row.detail);
    if (ch in channelCounts) channelCounts[ch] += 1;
  }
  const viewsByChannel = Object.entries(channelCounts).map(([channel, count]) => ({
    channel,
    count,
  }));

  const signedOpensRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE artifact_id = ? AND action = 'viewed' AND detail LIKE '%via signed-link%'`
    )
    .get(artifactId);
  const recipientOpensRow = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log WHERE artifact_id = ? AND action = 'viewed' AND detail LIKE '%via recipient-link%'`
    )
    .get(artifactId);

  const linkRows = db
    .prepare(
      `SELECT id, mode, role, recipient_emails, expires_at, revoked, created_at
       FROM share_links WHERE artifact_id = ? ORDER BY created_at DESC`
    )
    .all(artifactId);
  const now = Date.now();
  const links = linkRows.map((l) => {
    let status = "active";
    if (l.revoked) status = "revoked";
    else if (l.expires_at && new Date(l.expires_at).getTime() < now) status = "expired";
    return {
      id: l.id,
      mode: l.mode,
      role: l.role,
      recipients: l.recipient_emails,
      status,
      created_at: l.created_at,
      // Per-link attribution isn't recorded in audit_log; this is the total
      // opens across ALL links sharing this link's mode (signed vs recipient).
      modeOpens: l.mode === "signed" ? signedOpensRow.n : recipientOpensRow.n,
    };
  });

  const recentEvents = db
    .prepare(
      `SELECT action, actor, detail, created_at FROM audit_log
       WHERE artifact_id = ? ORDER BY id DESC LIMIT 20`
    )
    .all(artifactId);

  return json({
    title: artifact.title,
    totals,
    viewsByDay,
    viewsByChannel,
    links,
    recentEvents,
  });
});
