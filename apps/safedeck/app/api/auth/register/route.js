import db from "@/lib/db.js";
import { randomId, randomToken, hashPassword } from "@/lib/crypto.js";
import { createSession } from "@/lib/auth.js";
import { json, fail, handler } from "@/lib/api.js";

export const POST = handler(async (req) => {
  const { mode, orgName, joinCode, name, email, password } = await req.json();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail.includes("@")) return fail("valid email required");
  if (!name || !String(name).trim()) return fail("name required");
  if (!password || password.length < 8)
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
  ).run(userId, orgId, cleanEmail, String(name).trim(), hashPassword(password));

  createSession(userId);
  return json({ ok: true });
});
