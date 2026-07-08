import db from "./db.js";
import { randomId, sha256Hex, encryptText, decryptText } from "./crypto.js";

// Single write/read path for version content. HTML is encrypted at rest
// (AES-256-GCM); the SHA-256 fingerprint is always over the plaintext, so
// the integrity protocol is unchanged: decrypt, re-hash, compare.

export function insertVersion({ artifactId, versionNumber, authorId, html, note }) {
  const id = randomId("ver");
  const digest = sha256Hex(html);
  db.prepare(
    `INSERT INTO versions (id, artifact_id, version_number, author_id, html, sha256, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, artifactId, versionNumber, authorId, encryptText(html), digest, note || "");
  return { id, sha256: digest };
}

export function getVersionHtml(version) {
  return decryptText(version.html);
}
