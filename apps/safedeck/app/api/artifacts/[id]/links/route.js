import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { getArtifact, userRoleForArtifact } from "@/lib/access.js";
import { randomId, randomToken } from "@/lib/crypto.js";
import { getArtifactLabel, checkShareAllowed, clampExpiry } from "@/lib/labels.js";
import { audit } from "@/lib/audit.js";
import { sendMail } from "@/lib/mail.js";
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
  const links = db
    .prepare(
      `SELECT id, token, mode, role, recipient_emails, expires_at, revoked, created_at
       FROM share_links WHERE artifact_id = ? ORDER BY created_at DESC`
    )
    .all(artifact.id);
  return json({ links });
});

// Create a share link and email it to recipients.
export const POST = handler(async (req, { params }) => {
  const user = requireUser();
  const [artifact, err] = requireOwner(user, params.id);
  if (err) return err;

  const { mode, role, recipients, expiresAt, message } = await req.json();
  if (!["recipient", "signed"].includes(mode)) return fail("invalid mode");
  if (!["viewer", "commenter"].includes(role))
    return fail("link role must be viewer or commenter");

  // Sensitivity-label policy: the label can forbid link sharing entirely,
  // forbid anyone-with-link mode, and cap link lifetime.
  const label = getArtifactLabel(artifact);
  const policyError = checkShareAllowed(label, mode);
  if (policyError) {
    audit(artifact.id, user.email, "share_blocked_by_label", `${label.name}: ${mode}`);
    return fail(policyError, 403);
  }
  const effectiveExpiry = clampExpiry(label, expiresAt || null);

  const emails = String(recipients || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
  if (mode === "recipient" && emails.length === 0)
    return fail("recipient-bound links need at least one recipient email");
  if (expiresAt && isNaN(new Date(expiresAt).getTime()))
    return fail("invalid expiry");

  const id = randomId("lnk");
  const token = randomToken(32);
  db.prepare(
    `INSERT INTO share_links (id, token, artifact_id, mode, role, recipient_emails, expires_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    token,
    artifact.id,
    mode,
    role,
    emails.join(","),
    effectiveExpiry ? new Date(effectiveExpiry).toISOString() : null,
    user.id
  );

  const origin = new URL(req.url).origin;
  const shareUrl = `${origin}/share/${token}`;
  for (const to of emails) {
    sendMail({
      to,
      subject: `${user.name} shared “${artifact.title}” with you on SafeDeck`,
      body: `${user.name} (${user.email}, ${user.org_name}) shared the interactive deck “${artifact.title}” with you.\n\n${message ? message + "\n\n" : ""}Open it here:\n${shareUrl}\n\n${mode === "recipient" ? "You will be asked to verify this email address before viewing — the link only works for invited recipients." : "Anyone with this link can view it until it expires or is revoked."}\n\nContent integrity is verified with SHA-256 on every view.`,
      link: shareUrl,
    });
  }

  audit(
    artifact.id,
    user.email,
    "link_created",
    `${mode}/${role}${emails.length ? " → " + emails.join(", ") : ""}${expiresAt ? " expires " + expiresAt : ""}`
  );
  return json({ ok: true, id, url: shareUrl, token });
});

// Revoke a link (immediate).
export const PATCH = handler(async (req, { params }) => {
  const user = requireUser();
  const [artifact, err] = requireOwner(user, params.id);
  if (err) return err;
  const { linkId } = await req.json();
  const link = db
    .prepare("SELECT * FROM share_links WHERE id = ? AND artifact_id = ?")
    .get(linkId, artifact.id);
  if (!link) return fail("link not found", 404);
  db.prepare("UPDATE share_links SET revoked = 1 WHERE id = ?").run(linkId);
  audit(artifact.id, user.email, "link_revoked", `link ${linkId} (${link.mode})`);
  return json({ ok: true });
});
