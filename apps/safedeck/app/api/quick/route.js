import db, { PUBLIC_USER_ID, PUBLIC_ORG_ID } from "@/lib/db.js";
import { currentUser } from "@/lib/auth.js";
import { randomId, randomToken, sha256Hex } from "@/lib/crypto.js";
import { importHtmlFromUrl } from "@/lib/import.js";
import { audit } from "@/lib/audit.js";
import { json, fail, handler } from "@/lib/api.js";

const MAX_HTML_BYTES = 2 * 1024 * 1024;

// Anonymous one-step share, like an online PDF tool: paste HTML (or import a
// URL) and get back a safe, sandboxed, tamper-evident link — no account
// required. Signing in first makes the artifact yours so you can edit it.
export const POST = handler(async (req) => {
  const { html: rawHtml, url, title } = await req.json();

  let html = rawHtml;
  let importedFrom = null;
  if ((!html || !String(html).trim()) && url) {
    html = await importHtmlFromUrl(url); // throws a 400 on bad/unsafe URL
    importedFrom = String(url).trim();
  }
  if (!html || !String(html).trim()) return fail("paste some HTML or a URL to import");
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES)
    return fail("content exceeds the 2 MB limit", 413);

  // Logged-in users own their quick shares (and can edit them); otherwise the
  // system "public" account owns an immutable anonymous snapshot.
  const user = currentUser();
  const ownerId = user ? user.id : PUBLIC_USER_ID;
  const orgId = user ? user.org_id : PUBLIC_ORG_ID;
  const actor = user ? user.email : "anonymous";

  const cleanTitle =
    (title && String(title).trim()) ||
    (importedFrom ? new URL(importedFrom).hostname : "Untitled artifact");

  const artifactId = randomId("art");
  const versionId = randomId("ver");
  const digest = sha256Hex(html);
  const linkId = randomId("lnk");
  const token = randomToken(32);

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO artifacts (id, org_id, owner_id, title) VALUES (?, ?, ?, ?)"
    ).run(artifactId, orgId, ownerId, cleanTitle);
    db.prepare(
      `INSERT INTO versions (id, artifact_id, version_number, author_id, html, sha256, note)
       VALUES (?, ?, 1, ?, ?, ?, ?)`
    ).run(versionId, artifactId, ownerId, html, digest, importedFrom ? `Imported from ${importedFrom}` : "Quick share");
    db.prepare("UPDATE artifacts SET current_version_id = ? WHERE id = ?").run(
      versionId,
      artifactId
    );
    // A signed (bearer) link: anyone with the link can view — the simplest safe
    // share. Owners can later add recipient-bound links from the workspace.
    db.prepare(
      `INSERT INTO share_links (id, token, artifact_id, mode, role, recipient_emails, expires_at, created_by)
       VALUES (?, ?, ?, 'signed', 'viewer', '', NULL, ?)`
    ).run(linkId, token, artifactId, ownerId);
  });
  tx();

  audit(
    artifactId,
    actor,
    "quick_created",
    `${importedFrom ? "imported " + importedFrom + " " : ""}sha256=${digest.slice(0, 16)}`
  );

  const origin = new URL(req.url).origin;
  return json({
    ok: true,
    url: `${origin}/share/${token}`,
    artifactId,
    sha256: digest,
    mine: Boolean(user),
  });
});
