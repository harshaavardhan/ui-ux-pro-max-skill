import db, { PUBLIC_USER_ID, PUBLIC_ORG_ID } from "@/lib/db.js";
import { currentUser } from "@/lib/auth.js";
import { randomId, randomToken } from "@/lib/crypto.js";
import { insertVersion } from "@/lib/versions.js";
import { importHtmlFromUrl } from "@/lib/import.js";
import { purgeExpiredQuickShares } from "@/lib/purge.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const EXPIRY_CHOICES = [1, 7, 30];
const DEFAULT_EXPIRY_DAYS = 7;

// Anonymous one-step share: drop/upload an .html file (or import a URL) and get back a
// safe, sandboxed, tamper-evident link — no account required. Content is
// encrypted at rest, links expire by default, and anonymous artifacts are
// permanently deleted once their link expires (see lib/purge.js).
export const POST = handler(async (req) => {
  purgeExpiredQuickShares();

  const { html: rawHtml, url, title, expiryDays } = await req.json();

  let html = rawHtml;
  let importedFrom = null;
  if ((!html || !String(html).trim()) && url) {
    html = await importHtmlFromUrl(url); // throws a 400 on bad/unsafe URL
    importedFrom = String(url).trim();
  }
  if (!html || !String(html).trim()) return fail("provide a link or an .html file");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES)
    return fail("content exceeds the 2 MB limit", 413);

  const user = currentUser();
  const ownerId = user ? user.id : PUBLIC_USER_ID;
  const orgId = user ? user.org_id : PUBLIC_ORG_ID;
  const actor = user ? user.email : "anonymous";

  const days = EXPIRY_CHOICES.includes(Number(expiryDays))
    ? Number(expiryDays)
    : DEFAULT_EXPIRY_DAYS;
  const expiresAt = new Date(Date.now() + days * 864e5).toISOString();

  const cleanTitle =
    (title && String(title).trim()) ||
    (importedFrom ? new URL(importedFrom).hostname : "Untitled artifact");

  const artifactId = randomId("art");
  const linkId = randomId("lnk");
  const token = randomToken(32);
  let created;

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO artifacts (id, org_id, owner_id, title) VALUES (?, ?, ?, ?)"
    ).run(artifactId, orgId, ownerId, cleanTitle);
    created = insertVersion({
      artifactId,
      versionNumber: 1,
      authorId: ownerId,
      html,
      note: importedFrom ? `Imported from ${importedFrom}` : "Quick share",
    });
    db.prepare("UPDATE artifacts SET current_version_id = ? WHERE id = ?").run(
      created.id,
      artifactId
    );
    db.prepare(
      `INSERT INTO share_links (id, token, artifact_id, mode, role, recipient_emails, expires_at, created_by)
       VALUES (?, ?, ?, 'signed', 'viewer', '', ?, ?)`
    ).run(linkId, token, artifactId, expiresAt, ownerId);
  });
  tx();

  audit(
    artifactId,
    actor,
    "quick_created",
    `${importedFrom ? "imported " + importedFrom + " " : ""}expires ${expiresAt} sha256=${created.sha256.slice(0, 16)}`
  );

  const origin = new URL(req.url).origin;
  return json({
    ok: true,
    url: `${origin}/share/${token}`,
    artifactId,
    sha256: created.sha256,
    expiresAt,
    mine: Boolean(user),
    token,
  });
});
