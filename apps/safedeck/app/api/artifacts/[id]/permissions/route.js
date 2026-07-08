import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact } from "@/lib/access.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

function requireOwner(user, artifactId) {
  const artifact = getArtifact(artifactId);
  if (!artifact) return [null, fail("not found", 404)];
  if (userRoleForArtifact(user, artifact) !== "owner")
    return [null, fail("owner access required", 403)];
  return [artifact, null];
}

export const GET = handler(async (req, { params }) => {
  const user = requireUser();
  const [artifact, err] = requireOwner(user, params.id);
  if (err) return err;
  const rows = db
    .prepare(
      `SELECT p.role, p.created_at, u.id AS user_id, u.email, u.name, o.name AS org_name
       FROM permissions p
       JOIN users u ON u.id = p.user_id
       JOIN orgs o ON o.id = u.org_id
       WHERE p.artifact_id = ? ORDER BY p.created_at ASC`
    )
    .all(artifact.id);
  return json({ permissions: rows });
});

// Grant a role to a registered user by email.
export const POST = handler(async (req, { params }) => {
  const user = requireUser();
  const [artifact, err] = requireOwner(user, params.id);
  if (err) return err;

  const { email, role } = await req.json();
  if (!["viewer", "commenter", "editor"].includes(role))
    return fail("role must be viewer, commenter, or editor");
  const target = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(String(email || "").trim().toLowerCase());
  if (!target)
    return fail(
      "no registered user with that email — for people outside ShareLock, use a share link instead",
      404
    );
  if (target.id === artifact.owner_id) return fail("that user is the owner");

  db.prepare(
    `INSERT INTO permissions (artifact_id, user_id, role, granted_by)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(artifact_id, user_id) DO UPDATE SET role = excluded.role`
  ).run(artifact.id, target.id, role, user.id);

  audit(artifact.id, user.email, "permission_granted", `${role} → ${target.email}`);
  return json({ ok: true });
});

export const DELETE = handler(async (req, { params }) => {
  const user = requireUser();
  const [artifact, err] = requireOwner(user, params.id);
  if (err) return err;
  const { userId } = await req.json();
  const target = db.prepare("SELECT email FROM users WHERE id = ?").get(userId);
  db.prepare("DELETE FROM permissions WHERE artifact_id = ? AND user_id = ?").run(
    artifact.id,
    userId
  );
  audit(artifact.id, user.email, "permission_removed", target?.email || userId);
  return json({ ok: true });
});
