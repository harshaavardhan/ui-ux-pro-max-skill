import db from "./db.js";

// Development transport: emails land in the in-app outbox (/outbox).
// Production: replace sendMail with an SMTP transport wired via env vars.
export function sendMail({ to, subject, body, link = "" }) {
  db.prepare(
    "INSERT INTO outbox (to_email, subject, body, link) VALUES (?, ?, ?, ?)"
  ).run(to, subject, body, link);
}
