import db from "@/lib/db.js";
import { resolveLinkByToken, isLinkActive, grantEmailForLink } from "@/lib/access.js";
import { getLabel } from "@/lib/labels.js";
import { purgeExpiredQuickShares } from "@/lib/purge.js";
import { json, handler } from "@/lib/api.js";

// Public link resolution for the /share/[token] page.
// Reveals only what the visitor's current standing entitles them to.
export const GET = handler(async (req, { params }) => {
  purgeExpiredQuickShares();
  const link = resolveLinkByToken(params.token);
  if (!link || !isLinkActive(link)) {
    return json({ status: "invalid" });
  }

  const artifact = db
    .prepare("SELECT id, title, current_version_id, label_id FROM artifacts WHERE id = ?")
    .get(link.artifact_id);
  const label = getLabel(artifact?.label_id);
  const labelInfo = label
    ? { name: label.name, color: label.color, watermark: Boolean(label.watermark) }
    : null;

  if (link.mode === "recipient") {
    const email = grantEmailForLink(link);
    if (!email) {
      // Not verified yet: reveal only that verification is required.
      return json({ status: "needs_verification", title: artifact?.title || "" });
    }
    return json({
      status: "granted",
      title: artifact.title,
      artifactId: artifact.id,
      role: link.role,
      email,
      mode: link.mode,
      label: labelInfo,
      expiresAt: link.expires_at,
    });
  }

  // signed link: bearer token grants access directly
  return json({
    status: "granted",
    title: artifact.title,
    artifactId: artifact.id,
    role: link.role,
    mode: link.mode,
    label: labelInfo,
    expiresAt: link.expires_at,
  });
});
