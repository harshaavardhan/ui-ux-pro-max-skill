import { cookies } from "next/headers";
import db from "./db.js";
import { randomToken } from "./crypto.js";

const SESSION_COOKIE = "sd_session";
const SESSION_DAYS = 7;

export function createSession(userId) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).run(token, userId, expires.toISOString());
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  cookies().delete(SESSION_COOKIE);
}

export function currentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.*, o.name AS org_name, o.join_code AS org_join_code
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN orgs o ON o.id = u.org_id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .get(token);
  return row || null;
}

export function requireUser() {
  const user = currentUser();
  if (!user) {
    const err = new Error("unauthorized");
    err.status = 401;
    throw err;
  }
  return user;
}
