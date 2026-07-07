import crypto from "crypto";
import fs from "fs";
import path from "path";

export function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

let secret = process.env.SAFEDECK_SECRET;
if (!secret) {
  // Dev fallback: persist a generated secret so grants survive restarts.
  const secretPath = path.join(process.cwd(), "data", ".dev-secret");
  try {
    secret = fs.readFileSync(secretPath, "utf8").trim();
  } catch {
    secret = crypto.randomBytes(32).toString("base64url");
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  }
}

function hmac(payload) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

// Signed grant: proves the bearer verified access to a share link.
// payload = { linkId, email, exp } (exp = unix seconds)
export function signGrant(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyGrant(token) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Password hashing: scrypt (no external deps).
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length &&
    crypto.timingSafeEqual(candidate, expected)
  );
}
