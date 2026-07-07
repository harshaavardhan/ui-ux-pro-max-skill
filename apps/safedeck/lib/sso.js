import { cookies } from "next/headers";
import db from "./db.js";
import { signGrant, verifyGrant, randomToken } from "./crypto.js";
import { audit } from "./audit.js";

// Microsoft Entra ID (Outlook / Microsoft 365) sign-in.
// Configured via env: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT (default
// 'common'). When MS_CLIENT_ID is absent, a development simulator at
// /dev/outlook stands in so the flow stays demoable without Azure setup.

export function msConfigured() {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

function tenant() {
  return process.env.MS_TENANT || "common";
}

export function msAuthorizeUrl(origin, state) {
  const p = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${origin}/api/auth/outlook/callback`,
    response_mode: "query",
    scope: "openid profile email",
    state,
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${p}`;
}

export async function msExchangeCode(origin, code) {
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID,
        client_secret: process.env.MS_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${origin}/api/auth/outlook/callback`,
      }),
    }
  );
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const data = await res.json();
  // The id_token arrives directly from Microsoft's token endpoint over TLS
  // in a confidential-client exchange, so decoding without local signature
  // verification is acceptable here.
  const payload = JSON.parse(
    Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8")
  );
  const email = (payload.email || payload.preferred_username || "").toLowerCase();
  const name = payload.name || email.split("@")[0];
  if (!email.includes("@")) throw new Error("Microsoft account has no email claim");
  return { email, name };
}

// Shared post-identity step for real OAuth and the dev simulator:
// existing user → session; unknown user → pending-SSO cookie + /register.
// Returns { dest, cookies: [[name, value, options]] } for the caller to apply.
export function finishSso({ email, name }) {
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  const base = { httpOnly: true, sameSite: "lax", path: "/" };
  if (user) {
    const token = randomToken(32);
    const expires = new Date(Date.now() + 7 * 864e5);
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).run(token, user.id, expires.toISOString());
    audit(null, email, "sso_login", "microsoft");
    return {
      dest: "/dashboard",
      cookies: [["sd_session", token, { ...base, expires }]],
    };
  }
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  return {
    dest: "/register?sso=1",
    cookies: [
      ["sd_sso", signGrant({ t: "sso", email, name, exp }), { ...base, maxAge: 15 * 60 }],
    ],
  };
}

export function pendingSso() {
  const payload = verifyGrant(cookies().get("sd_sso")?.value);
  if (!payload || payload.t !== "sso") return null;
  return { email: payload.email, name: payload.name };
}
