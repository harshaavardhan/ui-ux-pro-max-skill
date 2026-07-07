import db from "./db.js";

export function audit(artifactId, actor, action, detail = "") {
  db.prepare(
    "INSERT INTO audit_log (artifact_id, actor, action, detail) VALUES (?, ?, ?, ?)"
  ).run(artifactId, actor, action, detail);
}
