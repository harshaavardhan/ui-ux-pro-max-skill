# The SafeDeck Artifact Protocol (SAP)

Status: living specification for the SafeDeck platform
Scope: how artifacts are stored, verified, rendered, shared, and audited

SafeDeck exists to replace the practice of emailing PowerPoint decks between
companies with something that is interactive (HTML artifacts) and provably
safe: the recipient can trust that what they see is exactly what was sent,
and the sender can trust that the artifact cannot be used against the
recipient (or vice versa). This document specifies the protocol — SAP — that
makes both guarantees hold.

SAP has seven parts:

1. Integrity (tamper-evidence)
2. Safe rendering sandbox
3. Identity & access model
4. Share links (cross-company sharing)
5. Audit trail
6. Collaboration semantics
7. Email flow

---

## 1. Integrity (tamper-evidence)

**Immutability.** Every artifact version is immutable once written. Editing
an artifact never mutates an existing row — it always appends a new version
row. There is no update path for version content in the data model.

**What a version stores.** Each version row holds:

| field | meaning |
|---|---|
| `html` | the artifact source, verbatim |
| `sha256` | hex digest of the exact UTF-8 bytes of `html` |
| `author_id` | user who created this version |
| `version_number` | monotonically increasing per artifact |
| `note` | optional free-text changelog note |
| `created_at` | timestamp |

**Verification on every read.** On every render request, the server
recomputes SHA-256 over the stored HTML bytes and compares it to the stored
digest. This is not a write-time-only check — it happens on every single
render, every time. If the recomputed digest does not match the stored
digest, the server responds `409 Conflict`, refuses to serve the artifact,
and shows an "integrity violation" page in its place. The artifact is never
served in a possibly-tampered state, ever.

**Out-of-band fingerprint comparison.** The digest is not just an internal
check — it is a trust signal for humans. The first 16 hex characters of the
SHA-256 digest (expandable to the full digest on demand) are displayed in
the viewer chrome to every viewer, sender and recipient alike. This lets two
parties on a call, in an email thread, or in a chat message compare
fingerprints out-of-band and independently confirm they are looking at the
same bytes, the same way you'd verify a PGP key fingerprint or an SSH host
key.

---

## 2. Safe rendering sandbox

**Never inlined.** Artifact HTML is never embedded into the SafeDeck
application's own DOM. It is never treated as a fragment injected into a
host page. Instead it is served whole by a dedicated endpoint,
`GET /api/render/[versionId]`, and displayed to the user inside:

```html
<iframe sandbox="allow-scripts" src="/api/render/[versionId]"></iframe>
```

Note deliberately what is **absent**: `allow-same-origin` is never granted.
Without it, the iframe's content executes in a browser-assigned *opaque
origin* — distinct from SafeDeck's origin and distinct from every other
render of every other artifact. An opaque origin cannot read SafeDeck's
cookies, cannot touch SafeDeck's `localStorage`/`sessionStorage`, and cannot
reach into the parent DOM. The artifact is fully isolated from the host
application and from other artifacts.

**Response headers.** The render response carries:

```
Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline';
  script-src 'unsafe-inline'; img-src data: blob:; font-src data:;
  form-action 'none'; frame-ancestors 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

`X-Frame-Options` is deliberately omitted; `frame-ancestors 'self'` in the
CSP supersedes it and is honored by all modern browsers.

**Net effect of the CSP.** Inline interactivity is fully functional — inline
`<script>` and `<style>` execute, and images can be embedded as `data:`/
`blob:` URIs — but `default-src 'none'` combined with the absence of any
`connect-src`, and the absence of an `https:`/`http:` source anywhere in the
policy, blocks all external network access: no `fetch`, no `XMLHttpRequest`,
no WebSocket, no externally-hosted images or fonts, no third-party
beacons. A malicious or compromised artifact has no channel to exfiltrate
data or phone home. Combined with the opaque-origin sandbox above, an
artifact is boxed in on two independent axes — network and DOM/storage
access — so a failure of one containment does not imply a failure of both.

---

## 3. Identity & access model

**Organizations and users.** Organizations own artifacts. Every user belongs
to exactly one organization. A user registers with email + password (hashed
with scrypt) or joins an existing organization using that organization's
join code.

**Roles.** Roles are defined per artifact and are strictly ordered:

```
owner > editor > commenter > viewer
```

| role | can do |
|---|---|
| `owner` | manage permissions and share links; everything below |
| `editor` | save new versions; everything below |
| `commenter` | post comments; everything below |
| `viewer` | view the artifact only |

**Grant types.**

- **Internal grants** are `(artifact, user) → role` rows: an explicit,
  named permission for a user who belongs to the owning org (or another org
  known to SafeDeck).
- **External access** — for people outside the artifact's granting model
  entirely — is available *only* through share links (Section 4). There is
  no mechanism for an external, unauthenticated party to be granted a role
  row directly.

---

## 4. Share links (cross-company sharing)

Share links are how SafeDeck artifacts cross company boundaries. Every link
carries a role (`viewer` or `commenter`), an optional expiry, and is
revocable at any time by the owner regardless of mode. The owner chooses
one of two modes per link:

### recipient-bound (default, strongest)

The link stores an allowlist of recipient emails. Opening the link requires
the visitor to prove control of one of the allowlisted addresses via a
one-time magic link:

- the magic link expires after 15 minutes
- the magic link is single-use

Because the link itself grants nothing without that email verification, a
recipient-bound link that is forwarded to someone not on the allowlist is
useless to them.

On successful verification, the visitor receives a short-lived **signed
grant cookie**: `HMAC-SHA256` over `(link_id, email, expiry)`, valid for 24
hours, scoped to that specific link. The cookie — not the original link
token — is what subsequent render/comment requests check.

### signed (convenience)

The URL token itself is the bearer credential. Anyone who has the URL can
view (or comment, per the link's role) until the link expires or is
revoked. This mode is documented, in-product, as **lower assurance**:
forwarding the URL is equivalent to forwarding access.

### Shared mechanics

- Link tokens are 32 bytes of CSPRNG output, base64url-encoded.
- Grant cookies and magic-link tokens are `HMAC-SHA256`-signed with a
  server secret, `SAFEDECK_SECRET`. In development, if unset, a secret is
  auto-generated and persisted to `data/` so it survives restarts; in
  production it must be set explicitly.
- Revocation is immediate and server-authoritative: every render or comment
  request re-checks the link's revoked/expired status server-side. There is
  no client-cached or grace-period access after revocation.

---

## 5. Audit trail

Every security-relevant event is appended to an append-only audit log kept
per artifact. Logged events:

- artifact created
- version saved
- artifact viewed (actor recorded as the internal user, or the verified
  external email for link-based access)
- share link created / revoked
- permission granted / removed
- comment added
- magic-link verification success / failure
- integrity check failure

Owners can see the full log for their artifacts in the app. The log is
never edited or pruned by SafeDeck — it is the ground truth for "who did
what, when" across an artifact's lifetime, including failed and rejected
attempts (a failed magic-link verification or a caught integrity violation
is itself logged, not just successes).

---

## 6. Collaboration semantics

**Soft-locked versioned editing.** An editor opening an artifact for
editing acquires an advisory lock. The lock is kept alive by a heartbeat
every 30 seconds and is considered stale after 90 seconds without a
heartbeat. If a second editor opens the same artifact while the lock is
held, they see who holds it and may take it over; taking over a lock is an
audited event.

The lock is advisory, not a correctness mechanism: because saves *always*
append a new version rather than mutating one in place (Section 1), even a
stale or wrongly-taken-over lock can never cause a silent overwrite. The
worst case of a lock race is an extra version being created, never lost
data.

**Comments.** Comments are threaded per artifact and attributed either to
an internal user or to a verified external email (i.e., someone who
authenticated through a recipient-bound share link's magic-link flow).
Anyone with commenter role or above can post; anyone with viewer access or
above — including plain viewers — can read the thread. Posting requires at
least `commenter`.

---

## 7. Email flow

Share and magic-link emails are composed server-side. In development,
outbound email is not sent over SMTP at all — it lands in an in-app dev
outbox at `/outbox` for inspection. In production, SMTP is wired via
environment variables.

In both environments, emails contain **only the safe link** — the share
link or the magic link — and never the artifact's HTML content itself. The
artifact content is only ever obtainable through the sandboxed render
endpoint after the appropriate access check (Sections 2–4).

---

## Threat model

| threat | mitigation |
|---|---|
| Forwarded share link reaches an unintended party | recipient-bound mode: link grants nothing until the visitor verifies control of an allowlisted email; a forwarded link is inert for anyone else |
| Tampered/modified artifact content | every render recomputes SHA-256 over stored bytes and compares to the immutable stored digest; mismatch blocks serving with `409` |
| Malicious or compromised artifact tries to exfiltrate data | strict CSP with no network-capable `src` directives blocks all external requests; opaque-origin iframe sandbox (no `allow-same-origin`) blocks cookie/storage/parent-DOM access |
| Stolen/leaked render URL | the render endpoint is not a standalone bearer URL — it requires an active session or a valid, currently-unrevoked grant (internal role or share-link grant cookie); the URL alone is not sufficient |
| Leaked magic link | 15-minute expiry and single-use consumption bound the exposure window to effectively one valid click |
| Insider over-permissioning (e.g., an owner grants too broadly) | every permission grant/removal is written to the per-artifact audit log, visible to owners, so over-broad grants are discoverable after the fact |
| XSS from artifact content reaching the host application | artifact HTML is never inlined into the app's DOM; it is only ever rendered inside a sandboxed iframe without `allow-same-origin`, in an opaque origin isolated from the host |
