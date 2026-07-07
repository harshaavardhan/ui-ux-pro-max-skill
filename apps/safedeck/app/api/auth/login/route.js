import db from "@/lib/db.js";
import { verifyPassword } from "@/lib/crypto.js";
import { createSession } from "@/lib/auth.js";
import { json, fail, handler } from "@/lib/api.js";

export const POST = handler(async (req) => {
  const { email, password } = await req.json();
  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(String(email || "").trim().toLowerCase());
  if (!user || !verifyPassword(password || "", user.password_hash)) {
    return fail("invalid email or password", 401);
  }
  createSession(user.id);
  return json({ ok: true });
});
