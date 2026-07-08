import { NextResponse } from "next/server";
import db from "@/lib/db.js";
import { signGrant, randomToken } from "@/lib/crypto.js";
import { audit } from "@/lib/audit.js";
import { handler } from "@/lib/api.js";

const GRANT_HOURS = 24;

export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const row = token
    ? db.prepare("SELECT * FROM magic_tokens WHERE token = ?").get(token)
    : null;

  const redirectFail = NextResponse.redirect(
    new URL("/share/invalid?reason=magic", url.origin)
  );

  if (!row || row.used || new Date(row.expires_at).getTime() < Date.now()) {
    return redirectFail;
  }

  // Passwordless member sign-in token.
  if (row.purpose === "login") {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(row.email);
    if (!user) return redirectFail;
    db.prepare("UPDATE magic_tokens SET used = 1 WHERE token = ?").run(token);
    const sessionToken = randomToken(32);
    const expires = new Date(Date.now() + 7 * 864e5);
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).run(sessionToken, user.id, expires.toISOString());
    audit(null, row.email, "login_link_used", "");
    const res = NextResponse.redirect(new URL("/dashboard", url.origin));
    res.cookies.set("sd_session", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires,
    });
    return res;
  }

  const link = db
    .prepare("SELECT * FROM share_links WHERE id = ?")
    .get(row.share_link_id);
  if (!link || link.revoked) return redirectFail;

  db.prepare("UPDATE magic_tokens SET used = 1 WHERE token = ?").run(token);

  const exp = Math.floor(Date.now() / 1000) + GRANT_HOURS * 3600;
  const grant = signGrant({ linkId: link.id, email: row.email, exp });

  audit(link.artifact_id, row.email, "magic_link_verified", `link ${link.id}`);

  const res = NextResponse.redirect(new URL(`/share/${link.token}`, url.origin));
  res.cookies.set(`sd_grant_${link.id}`, grant, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: GRANT_HOURS * 3600,
  });
  return res;
});
