import db from "@/lib/db.js";
import { randomToken } from "@/lib/crypto.js";
import { resolveLinkByToken, isLinkActive, linkRecipients } from "@/lib/access.js";
import { sendMail } from "@/lib/mail.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const MAGIC_MINUTES = 15;

export const POST = handler(async (req) => {
  const { shareToken, email } = await req.json();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail.includes("@")) return fail("valid email required");

  const link = resolveLinkByToken(shareToken);
  if (!link || !isLinkActive(link) || link.mode !== "recipient") {
    return fail("this share link is invalid, expired, or revoked", 404);
  }

  // Anti-enumeration: respond identically whether or not the email is on
  // the allowlist; only actually issue a token for allowed recipients.
  if (linkRecipients(link).includes(cleanEmail)) {
    const token = randomToken(32);
    const expires = new Date(Date.now() + MAGIC_MINUTES * 60e3).toISOString();
    db.prepare(
      "INSERT INTO magic_tokens (token, email, share_link_id, expires_at) VALUES (?, ?, ?, ?)"
    ).run(token, cleanEmail, link.id, expires);

    const artifact = db
      .prepare("SELECT title FROM artifacts WHERE id = ?")
      .get(link.artifact_id);
    const origin = new URL(req.url).origin;
    const verifyUrl = `${origin}/api/auth/magic/verify?token=${token}`;
    sendMail({
      to: cleanEmail,
      subject: `Verify your access to “${artifact?.title || "an artifact"}” on SafeDeck`,
      body: `Someone shared “${artifact?.title}” with ${cleanEmail}. Click the link below within ${MAGIC_MINUTES} minutes to verify this address and open it. The link works once.\n\n${verifyUrl}`,
      link: verifyUrl,
    });
    audit(link.artifact_id, cleanEmail, "magic_link_requested", `link ${link.id}`);
  } else {
    audit(
      link.artifact_id,
      cleanEmail,
      "magic_link_denied",
      `email not on allowlist for link ${link.id}`
    );
  }

  return json({
    ok: true,
    message:
      "If that address is on the recipient list, a verification email has been sent. (Dev: check /outbox.)",
  });
});
