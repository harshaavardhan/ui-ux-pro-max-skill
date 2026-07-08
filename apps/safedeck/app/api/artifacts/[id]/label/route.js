import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact } from "@/lib/access.js";
import { getLabel } from "@/lib/labels.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

export const dynamic = "force-dynamic";

// Assign or clear an artifact's sensitivity label (owner only).
export const PATCH = handler(async (req, { params }) => {
  const user = requireUser();
  const artifact = getArtifact(params.id);
  if (!artifact) return fail("not found", 404);
  if (userRoleForArtifact(user, artifact) !== "owner")
    return fail("owner access required", 403);

  const { labelId } = await req.json();
  let label = null;
  if (labelId) {
    label = getLabel(labelId);
    if (!label || label.org_id !== user.org_id)
      return fail("unknown label", 400);
  }

  db.prepare("UPDATE artifacts SET label_id = ? WHERE id = ?").run(
    label ? label.id : null,
    artifact.id
  );
  audit(
    artifact.id,
    user.email,
    "label_changed",
    label ? `→ ${label.name}` : "→ (none)"
  );
  return json({ ok: true, label });
});
