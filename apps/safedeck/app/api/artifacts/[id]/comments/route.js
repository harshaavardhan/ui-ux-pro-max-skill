import db from "@/lib/db.js";
import { resolveAccess, hasRole } from "@/lib/access.js";
import { randomId } from "@/lib/crypto.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

export const GET = handler(async (req, { params }) => {
  const linkToken = new URL(req.url).searchParams.get("link");
  const access = resolveAccess(params.id, linkToken);
  if (!access) return fail("not found or no access", 404);

  const comments = db
    .prepare(
      `SELECT c.id, c.version_number, c.body, c.created_at, c.author_email,
              u.name AS author_name
       FROM comments c LEFT JOIN users u ON u.id = c.author_user_id
       WHERE c.artifact_id = ? ORDER BY c.created_at ASC`
    )
    .all(params.id);
  return json({ comments, canComment: hasRole(access.role, "commenter") });
});

export const POST = handler(async (req, { params }) => {
  const { body, versionNumber, link: linkToken, guestName } = await req.json();
  const access = resolveAccess(params.id, linkToken);
  if (!access) return fail("not found or no access", 404);
  if (!hasRole(access.role, "commenter"))
    return fail("commenter access required", 403);
  if (!body || !String(body).trim()) return fail("comment body required");

  let authorUserId = null;
  let authorEmail = null;
  if (access.via === "member") {
    authorUserId = access.user.id;
  } else if (access.via === "recipient-link") {
    authorEmail = access.email;
  } else {
    // signed link: identity is unverified — label it as such
    const name = String(guestName || "Guest").trim().slice(0, 60) || "Guest";
    authorEmail = `${name} (unverified, via link)`;
  }

  db.prepare(
    `INSERT INTO comments (id, artifact_id, version_number, author_user_id, author_email, body)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    randomId("cmt"),
    params.id,
    versionNumber || null,
    authorUserId,
    authorEmail,
    String(body).trim().slice(0, 4000)
  );

  audit(params.id, access.actor, "comment_added", `on v${versionNumber || "?"}`);
  return json({ ok: true });
});
