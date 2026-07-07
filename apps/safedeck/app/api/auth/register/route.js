import { cookies } from "next/headers";
import db from "@/lib/db.js";
import { randomId, randomToken, hashPassword } from "@/lib/crypto.js";
import { createSession } from "@/lib/auth.js";
import { pendingSso } from "@/lib/sso.js";
import { json, fail, handler } from "@/lib/api.js";

export const POST = handler(async (req) => {
  const { mode, orgName, joinCode, name, email, password, sso } = await req.json();

  // SSO completion: identity comes from the verified pending-SSO cookie
  // (set after Microsoft sign-in), not from the request body. No password.
  let ssoIdentity = null;
  if (sso) {
    ssoIdentity = pendingSso();
    if (!ssoIdentity)
      return fail("your Microsoft sign-in expired — please sign in again", 401);
  }

  const cleanEmail = (ssoIdentity ? ssoIdentity.email : String(email || ""))
    .trim()
    .toLowerCase();
  const cleanName = String((ssoIdentity ? name || ssoIdentity.name : name) || "").trim();
  if (!cleanEmail.includes("@")) return fail("valid email required");
  if (!cleanName) return fail("name required");
  if (!ssoIdentity && (!password || password.length < 8))
    return fail("password must be at least 8 characters");

  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(cleanEmail);
  if (existing) return fail("an account with this email already exists", 409);

  let orgId;
  if (mode === "join") {
    const org = db
      .prepare("SELECT id FROM orgs WHERE join_code = ?")
      .get(String(joinCode || "").trim());
    if (!org) return fail("invalid organization join code");
    orgId = org.id;
  } else {
    if (!orgName || !String(orgName).trim())
      return fail("organization name required");
    orgId = randomId("org");
    db.prepare("INSERT INTO orgs (id, name, join_code) VALUES (?, ?, ?)").run(
      orgId,
      String(orgName).trim(),
      randomToken(6)
    );
  }

  const userId = randomId("usr");
  db.prepare(
    "INSERT INTO users (id, org_id, email, name, password_hash) VALUES (?, ?, ?, ?, ?)"
  ).run(
    userId,
    orgId,
    cleanEmail,
    cleanName,
    ssoIdentity ? null : hashPassword(password)
  );

  if (ssoIdentity) cookies().delete("sd_sso");
  createSession(userId);
  return json({ ok: true });
});
