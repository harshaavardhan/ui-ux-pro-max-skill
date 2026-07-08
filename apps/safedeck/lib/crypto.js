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

let secret = process.env.SHARELOCK_SECRET;
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

// ---- At-rest content encryption (AES-256-GCM) ----
// Version HTML is stored encrypted; the SHA-256 integrity fingerprint is
// always computed over the *plaintext*, so tamper-evidence is unchanged.
// Key: SHARELOCK_DATA_KEY (base64url, 32 bytes) or derived from the server
// secret via HKDF so dev environments need no extra config.
let dataKey = null;
function getDataKey() {
  if (dataKey) return dataKey;
  const explicit = process.env.SHARELOCK_DATA_KEY;
  if (explicit) {
    dataKey = Buffer.from(explicit, "base64url");
    if (dataKey.length !== 32) throw new Error("SHARELOCK_DATA_KEY must be 32 bytes (base64url)");
  } else {
    dataKey = crypto.hkdfSync("sha256", Buffer.from(secret), Buffer.alloc(0), "sharelock-data-v1", 32);
    dataKey = Buffer.from(dataKey);
  }
  return dataKey;
}

const ENC_PREFIX = "enc:v1:";

export function encryptText(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getDataKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + iv.toString("base64url") + ":" + tag.toString("base64url") + ":" + ct.toString("base64url");
}

export function decryptText(stored) {
  if (!isEncrypted(stored)) return stored; // legacy plaintext rows
  const [iv, tag, ct] = stored.slice(ENC_PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getDataKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function isEncrypted(stored) {
  return typeof stored === "string" && stored.startsWith(ENC_PREFIX);
}

export function randomUuid() {
  return crypto.randomUUID();
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
