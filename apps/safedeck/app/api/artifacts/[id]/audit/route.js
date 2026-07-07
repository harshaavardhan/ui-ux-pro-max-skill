import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact } from "@/lib/access.js";
import { json, fail, handler } from "@/lib/api.js";

export const GET = handler(async (req, { params }) => {
  const user = requireUser();
  const artifact = getArtifact(params.id);
  if (!artifact) return fail("not found", 404);
  if (userRoleForArtifact(user, artifact) !== "owner")
    return fail("owner access required", 403);

  const events = db
    .prepare(
      `SELECT actor, action, detail, created_at
       FROM audit_log WHERE artifact_id = ?
       ORDER BY id DESC LIMIT 200`
    )
    .all(artifact.id);
  return json({ events });
});
