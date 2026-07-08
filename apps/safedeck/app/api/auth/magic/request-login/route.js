import db from "@/lib/db.js";
import { randomToken } from "@/lib/crypto.js";
import { sendMail } from "@/lib/mail.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const MAGIC_MINUTES = 15;

// Passwordless sign-in for existing members: emails a one-time link.
// Responds identically whether or not the account exists (anti-enumeration).
export const POST = handler(async (req) => {
  const { email } = await req.json();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail.includes("@")) return fail("valid email required");

  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(cleanEmail);
  if (user) {
    const token = randomToken(32);
    const expires = new Date(Date.now() + MAGIC_MINUTES * 60e3).toISOString();
    db.prepare(
      "INSERT INTO magic_tokens (token, email, share_link_id, expires_at, purpose) VALUES (?, ?, NULL, ?, 'login')"
    ).run(token, cleanEmail, expires);

    const origin = new URL(req.url).origin;
    const verifyUrl = `${origin}/api/auth/magic/verify?token=${token}`;
    sendMail({
      to: cleanEmail,
      subject: "Your ShareLock sign-in link",
      body: `Click within ${MAGIC_MINUTES} minutes to sign in to ShareLock. The link works once.\n\n${verifyUrl}\n\nIf you didn't request this, ignore this email.`,
      link: verifyUrl,
    });
    audit(null, cleanEmail, "login_link_requested", "");
  }

  return json({
    ok: true,
    message:
      "If that account exists, a sign-in link has been sent. (Dev: check /outbox.)",
  });
});
