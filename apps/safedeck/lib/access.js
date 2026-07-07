import { cookies } from "next/headers";
import db from "./db.js";
import { currentUser } from "./auth.js";
import { verifyGrant } from "./crypto.js";

export const ROLE_RANK = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

export function hasRole(role, needed) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[needed] || 99);
}

export function getArtifact(artifactId) {
  return db.prepare("SELECT * FROM artifacts WHERE id = ?").get(artifactId);
}

// Internal role: explicit grants only (no implicit org-wide access).
export function userRoleForArtifact(user, artifact) {
  if (!user || !artifact) return null;
  if (artifact.owner_id === user.id) return "owner";
  const row = db
    .prepare("SELECT role FROM permissions WHERE artifact_id = ? AND user_id = ?")
    .get(artifact.id, user.id);
  return row ? row.role : null;
}

export function isLinkActive(link) {
  if (!link || link.revoked) return false;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now())
    return false;
  return true;
}

export function resolveLinkByToken(token) {
  if (!token) return null;
  return db.prepare("SELECT * FROM share_links WHERE token = ?").get(token) || null;
}

export function linkRecipients(link) {
  return link.recipient_emails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// For a recipient-bound link, returns the verified email from the grant
// cookie, or null if the visitor has not completed magic-link verification.
export function grantEmailForLink(link) {
  const cookie = cookies().get(`sd_grant_${link.id}`)?.value;
  const payload = verifyGrant(cookie);
  if (!payload || payload.linkId !== link.id) return null;
  const email = String(payload.email || "").toLowerCase();
  if (!linkRecipients(link).includes(email)) return null;
  return email;
}

// Unified access resolution for a request touching an artifact.
// Order: authenticated internal user first, then share link.
// Returns { role, actor, via, link?, email? } or null.
export function resolveAccess(artifactId, linkToken) {
  const artifact = getArtifact(artifactId);
  if (!artifact) return null;

  const user = currentUser();
  if (user) {
    const role = userRoleForArtifact(user, artifact);
    if (role) {
      return { role, actor: `${user.email}`, via: "member", user, artifact };
    }
  }

  if (linkToken) {
    const link = resolveLinkByToken(linkToken);
    if (link && link.artifact_id === artifactId && isLinkActive(link)) {
      if (link.mode === "signed") {
        return {
          role: link.role,
          actor: `link:${link.id}`,
          via: "signed-link",
          link,
          artifact,
        };
      }
      const email = grantEmailForLink(link);
      if (email) {
        return {
          role: link.role,
          actor: email,
          via: "recipient-link",
          link,
          email,
          artifact,
        };
      }
    }
  }
  return null;
}
