import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH =
  process.env.SHARELOCK_DB_PATH ||
  path.join(process.cwd(), "data", "sharelock.db");

let db = globalThis.__sharelock_db;

if (!db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  globalThis.__sharelock_db = db;
}

function migrate(db) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    current_version_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    version_number INTEGER NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id),
    html TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (artifact_id, version_number)
  );

  CREATE TABLE IF NOT EXISTS permissions (
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('viewer','commenter','editor','owner')),
    granted_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (artifact_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    mode TEXT NOT NULL CHECK (mode IN ('recipient','signed')),
    role TEXT NOT NULL CHECK (role IN ('viewer','commenter')),
    recipient_emails TEXT NOT NULL DEFAULT '',
    expires_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS magic_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    share_link_id TEXT REFERENCES share_links(id),
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    version_number INTEGER,
    author_user_id TEXT REFERENCES users(id),
    author_email TEXT,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS edit_locks (
    artifact_id TEXT PRIMARY KEY REFERENCES artifacts(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
    heartbeat_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    artifact_id TEXT REFERENCES artifacts(id),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_versions_artifact ON versions(artifact_id);
  `);

  // Additive migrations for existing databases.
  try {
    db.exec("ALTER TABLE magic_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'share'");
  } catch { /* column already exists */ }
  try {
    db.exec("ALTER TABLE orgs ADD COLUMN ai_credits INTEGER NOT NULL DEFAULT 25");
  } catch { /* column already exists */ }
  try {
    db.exec("ALTER TABLE artifacts ADD COLUMN label_id TEXT REFERENCES labels(id)");
  } catch { /* column already exists */ }

  // Sensitivity labels (MS Purview-compatible classification).
  // guid: stable identifier written into exports as MSIP_Label_<guid>_* —
  // admins may overwrite it with their real tenant label GUID for interop.
  db.exec(`
  CREATE TABLE IF NOT EXISTS labels (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id),
    guid TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6366f1',
    rank INTEGER NOT NULL DEFAULT 0,
    watermark INTEGER NOT NULL DEFAULT 0,
    allow_external INTEGER NOT NULL DEFAULT 1,
    allow_signed INTEGER NOT NULL DEFAULT 1,
    allow_ai INTEGER NOT NULL DEFAULT 1,
    max_expiry_days INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_labels_org ON labels(org_id);
  `);

  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_comments_artifact ON comments(artifact_id);
  CREATE INDEX IF NOT EXISTS idx_audit_artifact ON audit_log(artifact_id);
  CREATE INDEX IF NOT EXISTS idx_links_artifact ON share_links(artifact_id);
  `);

  // System account that owns anonymous "quick share" artifacts — nobody can
  // sign in as it, so these artifacts never surface in a real user's workspace.
  db.prepare(
    "INSERT OR IGNORE INTO orgs (id, name, join_code) VALUES ('org_public', 'Public quick shares', '__public__')"
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, org_id, email, name, password_hash) VALUES ('usr_public', 'org_public', 'public@sharelock.local', 'Anonymous', NULL)"
  ).run();
}

export const PUBLIC_USER_ID = "usr_public";
export const PUBLIC_ORG_ID = "org_public";

export default db;
