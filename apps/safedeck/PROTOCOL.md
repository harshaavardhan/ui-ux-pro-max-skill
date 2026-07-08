# The SafeDeck Artifact Protocol (SAP)

Status: living specification for the SafeDeck platform
Scope: how artifacts are stored, verified, rendered, shared, and audited

SafeDeck exists to replace the practice of emailing PowerPoint decks between
companies with something that is interactive (HTML artifacts) and provably
safe: the recipient can trust that what they see is exactly what was sent,
and the sender can trust that the artifact cannot be used against the
recipient (or vice versa). This document specifies the protocol — SAP — that
makes both guarantees hold.

SAP has eight parts:

1. Integrity (tamper-evidence)
2. Safe rendering sandbox
3. Identity & access model
4. Share links (cross-company sharing)
5. Audit trail
6. Collaboration semantics
7. Email flow
8. Sensitivity labels & document egress

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

**Encryption at rest.** Version `html` is stored AES-256-GCM encrypted.
`lib/versions.js` is the single read/write path for version content — every
insert encrypts, every read decrypts — so there is exactly one place where
this can go wrong, not one per call site. The encryption key comes from
`SAFEDECK_DATA_KEY` (a 32-byte, base64url-encoded key) when set, or is
otherwise HKDF-derived from the server secret (`SAFEDECK_SECRET`).

This is deliberately layered *underneath* the integrity model above, not
instead of it: the SHA-256 fingerprint is computed over the **plaintext**
HTML, exactly as before encryption was introduced, so the verification
protocol is unchanged — decrypt, recompute the digest over the plaintext,
compare to the stored digest, and only then serve. A decryption failure
(wrong key, corrupted ciphertext) is treated as an integrity violation just
like a hash mismatch: `409 Conflict`, with an `integrity_failure` entry
written to the audit log, and the artifact is not served. Version rows
written before encryption was introduced remain stored as plaintext; the
read path recognizes both formats, so legacy rows stay readable without a
migration.

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

**Microsoft (Outlook) single sign-on.** As an alternative to email +
password, a user may authenticate via Microsoft Entra ID using the OAuth 2.0
authorization-code flow against `login.microsoftonline.com`, requesting the
`openid profile email` scopes. The integration is configured via three
environment variables — `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, and `MS_TENANT`
(defaulting to `"common"`) — and its redirect URI is `{origin}/api/auth/outlook/callback`.
The flow is CSRF-protected with a random `state` value stored in a cookie and
checked against the value returned by Microsoft on callback.

The `id_token` is not obtained by redirecting the browser through an
implicit-flow fragment; it is received directly from Microsoft's token
endpoint over TLS, as part of a confidential-client authorization-code
exchange (client ID + client secret). Because that exchange happens
server-to-server over an authenticated TLS channel straight from Microsoft,
the claims inside the `id_token` — email/`preferred_username` and name — are
trusted as-is; SafeDeck does not separately re-verify the token's signature
locally. If the claimed email matches an existing account, the user is
signed in immediately. If the email is new, SafeDeck cannot yet place the
user in an organization, so it issues a short-lived (15-minute),
HMAC-signed pending-SSO cookie carrying the verified identity and redirects
to `/register`, where the user only has to pick or create an organization —
no password is ever collected or stored for an SSO-created account
(`password_hash` stays `NULL` on that user row).

When `MS_CLIENT_ID` is not configured (e.g. local development without real
Entra ID credentials), a clearly-labeled development simulator at
`/dev/outlook` stands in for the real Microsoft login screen. Its API
endpoint is disabled — it returns `404` — whenever real credentials are
actually configured, so the simulator can never be reachable in an
environment that has genuine SSO wired up.

**Passwordless email sign-in.** Members may also sign in without a password
via a magic sign-in link. `POST /api/auth/magic/request-login` issues a
single-use, 15-minute magic token — stored in the `magic_tokens` table,
which gained a `purpose` column (defaulting to `'share'`) so login tokens
can be tagged `purpose='login'` and distinguished from share-link
verification tokens. The existing `/api/auth/magic/verify` endpoint now
recognizes login-purpose tokens and, on success, creates a 7-day session for
that user (as distinct from the 24-hour scoped grant cookie issued for
recipient-bound share links — see Section 4).

The request endpoint is anti-enumeration by design: it returns an identical
response regardless of whether the submitted email belongs to an account,
and a token is only ever actually created when the account exists — so the
response gives no signal an attacker could use to test which emails are
registered. Requesting and consuming a login link are each audited as
`login_link_requested` / `login_link_used`.

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

### Anonymous quick shares

The front page offers a no-account, one-step path: a visitor pastes HTML,
uploads an `.html` file, or imports a URL, and receives a **signed** share
link immediately. Such artifacts are owned by a system account
(`usr_public`) that has no password and cannot be signed into, so they never
surface in any real user's workspace and are effectively immutable snapshots
— editing requires signing in, which makes new artifacts yours. A quick
share is a full artifact in every other respect: it is versioned,
SHA-256-fingerprinted, served only through the sandboxed render endpoint, and
its share link is revocable/expirable like any other signed link.

URL imports are performed **server-side** and snapshotted (never hot-linked —
the no-network CSP would block a live external page anyway), behind SSRF
guards: only `http`/`https` schemes; every resolved address is checked and
loopback, private (RFC 1918), CGNAT, link-local, and cloud-metadata
(`169.254.169.254`) ranges are rejected; redirects are refused (they could
bypass the address check); and responses are capped at 2 MB with an HTML
content-type requirement and a request timeout.

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

**Page-wise editing.** SafeDeck recognizes a deck convention on top of plain
HTML: each top-level `<section>` element inside `<body>` is treated as one
page. `lib/pages.js` implements this by lexically splitting a document into
a `prefix`, an array of `pages[]`, and a `suffix`, using depth-counted
`<section>` scanning (so nested `<section>` elements inside a top-level one
stay part of that page rather than being split out themselves).

Reassembly is byte-exact: `prefix + pages.join('') + suffix` reproduces the
original document exactly. This is not a cosmetic property — it is required
by Section 1, since versions are SHA-256 fingerprinted, and a page-wise
save that round-tripped through the splitter without reproducing the
original bytes for untouched pages would silently change the fingerprint
of content nobody edited. Documents that contain no top-level `<section>`
elements fall back to full-source editing rather than being forced into
the page model.

On top of this split, editors get a page list (select, add, delete,
reorder), a per-page source pane, and a live per-page preview rendered
inside a sandboxed `srcdoc` iframe with an injected no-network CSP `<meta>`
tag. That injected CSP is preview-only hardening for the editing surface;
it has no bearing on served artifacts, which continue to get their real
CSP from the response headers of the `/api/render/[versionId]` endpoint
(Section 2), independent of anything the editor does. Saving a page-wise
edit still always appends a brand-new immutable version, exactly as in
Section 1 — the page-wise editing surface is a convenience layered on top
of the protocol; it changes none of the protocol's integrity, immutability,
or soft-lock semantics. Page-wise editing, the soft edit lock, and the
full-source fallback (for documents with no top-level `<section>` pages, or
via the "Edit source" toggle) are all unchanged by everything below.

**Visual editor.** `app/artifacts/[id]/edit/page.js` provides a
direct-manipulation "studio" on top of the same page model: a
page-thumbnail rail, a live canvas, and a right-hand dock with a Design
tab (element inspector) and an Assistant tab (AI chat, below). The current
page is rendered in the canvas inside a sandboxed
`<iframe sandbox="allow-scripts">` — no `allow-same-origin`, so it is an
opaque origin exactly as described in Section 2 — with an injected editor
runtime (`lib/editor-runtime.js`). Clicking selects an element, double-click
enables inline (`contenteditable`) text editing, and the Design inspector
can change text color, font size, weight, style, alignment, background
color, corner radius, and padding; images can be replaced (uploaded as a
`data:` URI, capped at 2 MB); elements can be duplicated, deleted, and
reordered. The runtime and the parent app talk only via `postMessage`
(`sd-style`, `sd-delete`, `sd-duplicate`, `sd-move`, `sd-image`,
`sd-deselect` inbound; `sd-ready`, `sd-select`, `sd-deselect`, `sd-changed`
outbound) — because the iframe is opaque-origin sandboxed, the editing
surface has no way to reach the host app, the same isolation guarantee
Section 2 establishes for rendered artifacts. The canvas preview also
carries an injected no-network CSP `<meta>`, the same preview-only hardening
described above for the page-wise source editor.

**Clean serialization keeps integrity semantics unchanged.** This is the
load-bearing property of the visual editor: whenever a page changes, the
runtime serializes a *cleaned* copy of the page before it is handed back to
the app as draft content — every injected editor artifact (the CSP
`<meta>`, the `<style>`, the `<script>` runtime, all tagged with
`sd-editor-*` ids) and every `data-sd-*`/`contenteditable` attribute added
for editing purposes is stripped. Saved HTML therefore never contains any
editor code or editor markup, the page-wise `prefix + pages[] + suffix`
structure is preserved, and the SHA-256 fingerprint semantics of Section 1
are untouched — a save through the visual editor still always appends a
new immutable version, exactly like a save through the source editor.

**AI editing assistant.** The Assistant tab lets an editor type a
plain-English instruction (e.g. "make the headline bigger and bolder") and
have `app/api/ai/edit/route.js` rewrite the *currently selected page only*,
using the Anthropic Messages API (model `claude-opus-4-8`, adaptive
thinking, structured JSON output of `{html, summary}`). The returned HTML
replaces that page in the in-app draft; it is not auto-saved, so it still
has to go through the normal save path (and thus Section 1's
version-append semantics) to become a durable version. The AI is
constrained by its system prompt to the same safety envelope as the render
sandbox in Section 2: self-contained page HTML, inline styles only, no
external URLs (images/fonts/scripts/stylesheets must be `data:` URIs), and
no `<script src>`, `fetch`, or `XHR` — so an AI edit cannot itself
introduce a network-exfiltration vector, and even if it tried, the render
endpoint's real CSP (Section 2) still blocks network access at view time
regardless of what the draft HTML contains.

Every AI edit requires an Anthropic API key, from one of two sources: a
user-supplied key, kept only in that user's browser (`localStorage`), sent
directly with each edit request, and never persisted server-side; or the
org's platform credits (`orgs.ai_credits`, default 25), which require
`SAFEDECK_ANTHROPIC_KEY` to be configured server-side and are decremented
by one per successful platform-credit edit. A user-supplied key always
takes precedence and never consumes credits; if neither is available, the
edit request is refused with `402`. Provider-side failures are mapped to
typed HTTP responses — a rejected key to `401`, a provider rate limit to
`429`, other API errors to `502`, and a safety refusal
(`stop_reason: "refusal"`) to `422`. Every AI edit — success or otherwise
reaching the model — is written to the artifact's audit log as `ai_edit`,
noting the instruction and whether it drew on the user's own key or on
platform credits, extending Section 5's audit guarantees to AI-assisted
edits.

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

## 8. Sensitivity labels & document egress

The sections above establish that an artifact's *bytes* can be trusted
(Section 1) and that its *rendering* is contained (Section 2). This section
adds a third guarantee: that an artifact's *distribution and export* obey
an organization's own classification policy, in a form that is compatible
with Microsoft Purview — the classification system most enterprise
counterparties already run.

**Label taxonomy.** Each organization has its own set of sensitivity
labels, kept in a `labels` table. Four labels are seeded automatically for
every new org: `Public`, `Internal`, `Confidential`, and `Highly
Confidential`. A label has:

| field | meaning |
|---|---|
| `name` | display name |
| `color` | swatch shown wherever the label appears |
| `rank` | ordering (higher rank = more sensitive) |
| `guid` | a stable identifier — a random UUID by default, but an admin may instead paste in their organization's real Microsoft tenant label GUID, which is what makes the interop metadata below line up with the org's actual Purview taxonomy rather than a SafeDeck-local one |
| `allow_external` | whether the label permits share links at all |
| `allow_signed` | whether the label permits "anyone with the link" (signed-mode) links, as opposed to recipient-bound only |
| `allow_ai` | whether the AI editing assistant (Section 6) may be used on this content |
| `max_expiry_days` | the longest link lifetime the label allows |
| `watermark` | whether viewing/exporting the artifact overlays a watermark |

Labels are managed by org admins at `/labels`, backed by the `/api/labels`
API. Owners assign a label to an individual artifact via
`PATCH /api/artifacts/[id]/label`; an artifact with no label is
unrestricted by this section.

**Enforcement is server-side at every relevant boundary — never a client
hint.** Three points check the assigned label before acting:

- **Share-link creation.** If the label's `allow_external` is false, no
  share link — of either mode — can be created for that artifact at all.
  If `allow_signed` is false, only recipient-bound links (Section 4) may be
  created; a request for a signed link is refused. Either rejection is a
  `403`, logged to the audit trail as `share_blocked_by_label`.
- **AI editing.** If `allow_ai` is false, the AI editing assistant (Section
  6) refuses the request before it ever calls the model — blocked-label
  content is never sent to the LLM at all. This is a `403`, logged as
  `ai_blocked_by_label`.
- **Expiry clamping.** A link's requested expiry is clamped down to
  `max_expiry_days` from now if it would otherwise be longer (or
  unbounded); the label can shorten a requested lifetime but a link is
  never granted a *longer* lifetime than the label allows.

**Watermarks live in the viewer chrome, never in the artifact bytes.** When
a label's `watermark` flag is set, viewing (and exporting) the artifact
overlays a dynamic diagonal watermark — the label name plus the current
viewer's identity — on top of the rendered content. This overlay is drawn
by the viewer chrome around the sandboxed iframe from Section 2; it is
never injected into the artifact's HTML. That distinction matters for
Section 1: because the watermark never touches version bytes, the stored
SHA-256 fingerprint is completely unaffected by who is viewing an artifact
or what label is attached to it — the fingerprint two parties compare
out-of-band still identifies the same content regardless of watermarking.

**Export pipeline: PDF and DOCX.** `GET /api/export/pdf|docx?artifact=&
version=&link=&paper=A4|Letter&orientation=` produces a downloadable file
from a version. Access follows the same rules as viewing: a `viewer` role
(member session or share-link token) is sufficient, so external recipients
export through their existing share-link token exactly as they view.
Before anything is exported, integrity is re-verified precisely as in
Section 1 — decrypt (Section 1's encryption-at-rest), recompute the
SHA-256 digest, and compare to the stored value — and a mismatch or
decryption failure blocks the export with `409` the same way it blocks a
render. Every export, successful or not, is written to the audit log.

- **PDF.** Rendered via a headless-Chromium print pass (the binary path is
  configurable through `SAFEDECK_CHROMIUM_PATH`, and is auto-detected in
  development when unset). Each top-level `<section>` — the same page unit
  Section 6 defines for page-wise editing — becomes exactly one PDF page;
  backgrounds and gradients are preserved rather than flattened to white.
  When the artifact's label requires a watermark, both the diagonal
  watermark and a marking banner are stamped into the PDF itself (unlike
  the viewer-chrome-only watermark above — an exported file has to carry
  its own marking, since it leaves the viewer chrome behind). Metadata is
  written with `pdf-lib`.
- **DOCX.** Produced by converting the artifact HTML to `.docx` while
  preserving inline formatting and alignment. A labeled artifact gets a
  marking line and header identifying its classification. MSIP properties
  (below) are injected by post-processing the generated file as a zip.

**MSIP-compatible interop metadata.** To make a label recognizable to
Microsoft's own DLP and endpoint tooling — not just inside SafeDeck — every
export of a labeled artifact carries the same metadata convention Purview
itself writes into Office files:

- **DOCX** gets real `MSIP_Label_<guid>_Enabled`, `_Name`, `_Method`,
  `_SetDate`, and `_SiteId` custom document properties, written into
  `docProps/custom.xml`. This is the exact property naming Microsoft's own
  tooling looks for, which is why a label's `guid` can be set to an org's
  real Microsoft tenant label GUID instead of SafeDeck's random default —
  doing so makes an exported document read, to Microsoft DLP and endpoint
  agents, as if it had been labeled by Purview directly.
- **PDF** gets the same key/value pairs written into the PDF's `Keywords`
  metadata field, plus the stamped visual watermark/banner described above
  (PDF viewers don't honor custom document properties as policy the way
  Office applications do, so the visual mark carries the classification
  for PDFs where the metadata alone might go unread).

Stated plainly, as a caveat rather than a limitation to paper over: this is
classification, marking, policy enforcement, and Microsoft-tooling
interoperability — it is **not** Microsoft RMS/AIP-style encryption-backed
labeling. Real encryption-enforced labels require Microsoft's MIP SDK and
are out of scope here.

**Quick-share expiry and auto-delete.** Anonymous front-page shares
(Section 4) now require an expiry at creation time — 1, 7, or 30 days,
defaulting to 7 — rather than the open-ended lifetime they could
previously be given. `lib/purge.js` permanently deletes an anonymous
artifact — its versions, share links, comments, and audit rows, all of it
— once every link ever issued for it has expired or been revoked. There is
no separate cron job: purging is invoked lazily, as a side effect of the
next quick-share creation or share-link resolution request, so an
artifact's actual deletion happens the first time anything touches the
system after its links have all lapsed. This is what backs the front
page's promise to anonymous users: no sign-in required, encrypted at rest
(Section 1), and not kept once access to it has expired.

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
| Forged Microsoft SSO callback | the callback is rejected unless its `state` value matches the random state cookie set before redirecting to Microsoft, and the `id_token` is obtained via a direct, confidential-client, server-to-server exchange with Microsoft's token endpoint over TLS — an attacker cannot fabricate a valid callback without both the state secret and Microsoft's cooperation |
| Leaked passwordless (magic) login token | 15-minute expiry, single-use consumption, and an anti-enumeration request endpoint (identical response whether or not the account exists, and no token issued for non-existent accounts) bound both the exposure window and the ability to probe for valid accounts |
| Visual editor code leaking into a saved artifact | clean serialization strips every `sd-editor-*`-tagged node (injected CSP `<meta>`, `<style>`, runtime `<script>`) and every `data-sd-*`/`contenteditable` attribute before a page is handed back as draft content, so saved HTML never contains editor markup |
| AI-introduced network-exfiltration vector | the AI system prompt constrains output to the render sandbox's safety envelope (inline styles only, `data:`-only media, no `<script src>`/`fetch`/`XHR`); even if that constraint were bypassed, the render endpoint's real CSP (Section 2) still blocks network access at view time regardless of draft content |
| User's own Anthropic API key exposure | a user-supplied key is stored only in that user's browser `localStorage`, sent directly with each edit request, and never persisted server-side |
| Over-shared confidential content (a link created more broadly than policy allows) | the assigned label's `allow_external`/`allow_signed` flags are checked server-side at share-link creation; a disallowed link is refused with `403` and logged as `share_blocked_by_label` |
| Data-at-rest theft (stolen database file or disk) | version HTML is stored AES-256-GCM encrypted (`SAFEDECK_DATA_KEY` or an HKDF-derived key); the SHA-256 fingerprint is computed over the plaintext, so tamper-evidence is unaffected by the encryption layer |
| Stale anonymous data lingering indefinitely | `lib/purge.js` permanently deletes an anonymous quick-share artifact — versions, links, comments, and audit rows — once every link on it has expired or been revoked |
| Classified exports escaping DLP/endpoint controls once outside SafeDeck | PDF/DOCX exports of labeled artifacts carry MSIP-compatible metadata (`MSIP_Label_*` custom properties in DOCX, equivalent `Keywords` entries in PDF) so Microsoft DLP and endpoint tooling recognize the classification even after the file has left SafeDeck |
