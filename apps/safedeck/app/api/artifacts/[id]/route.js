import db from "@/lib/db.js";
import { resolveAccess, hasRole } from "@/lib/access.js";
import { json, fail, handler } from "@/lib/api.js";

// Artifact metadata + version history. Accessible to members with a role,
// or externally with ?link=<token> (recipient links need a verified grant).
export const GET = handler(async (req, { params }) => {
  const linkToken = new URL(req.url).searchParams.get("link");
  const access = resolveAccess(params.id, linkToken);
  if (!access) return fail("not found or no access", 404);

  const artifact = access.artifact;
  const versions = db
    .prepare(
      `SELECT v.id, v.version_number, v.sha256, v.note, v.created_at, u.name AS author_name
       FROM versions v JOIN users u ON u.id = v.author_id
       WHERE v.artifact_id = ? ORDER BY v.version_number DESC`
    )
    .all(artifact.id);

  return json({
    artifact: {
      id: artifact.id,
      title: artifact.title,
      created_at: artifact.created_at,
      current_version_id: artifact.current_version_id,
    },
    versions,
    access: {
      role: access.role,
      via: access.via,
      canEdit: hasRole(access.role, "editor"),
      canComment: hasRole(access.role, "commenter"),
      isOwner: access.role === "owner",
    },
  });
});
