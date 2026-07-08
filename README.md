# ShareLock

ShareLock is an enterprise platform for safely sharing interactive HTML
artifacts between companies, replacing the practice of emailing PowerPoint
decks around. Every artifact version is content-hashed and immutable,
every render is re-verified against that hash before it's served, and
every artifact is displayed inside a sandboxed iframe that cannot reach the
network or the host application — so a shared artifact can be trusted not
to have been tampered with, and not to phone home or attack the app it's
displayed in. Cross-company sharing is handled by share links, which can be
locked to a specific recipient's verified email address for the strongest
guarantee, or issued as simple bearer links for convenience. Full detail on
the underlying protocol is in [PROTOCOL.md](./PROTOCOL.md).

## Features

- One-step anonymous sharing (the front page): paste a link (a Claude
  artifact or any HTML page) or drop an `.html` file, and get a safe,
  sandboxed, tamper-evident link
  instantly — no account required, in the spirit of an online PDF tool. Sign
  in only when you want to edit, comment, or control access. URL imports are
  fetched server-side behind SSRF guards (http/https only, private/loopback/
  metadata addresses blocked, no redirects, 2 MB cap) and snapshotted so the
  served copy is fingerprinted and network-isolated like any other artifact
- Versioned artifacts: edits always append a new version, never overwrite one
- SHA-256 integrity check recomputed on every render, not just on save
- Sandboxed rendering: `<iframe sandbox="allow-scripts">` (no
  `allow-same-origin`) plus a strict CSP that blocks all external network
  access
- Org-based identity: register with email + password, or join an org via
  its join code
- Microsoft (Outlook) single sign-on: OAuth 2.0 authorization-code flow
  against Microsoft Entra ID, with a development simulator at `/dev/outlook`
  when no real Microsoft credentials are configured
- Passwordless email sign-in: "Email me a sign-in link" issues a 15-minute,
  single-use magic login link, with an anti-enumeration request endpoint
- Per-artifact roles: `owner > editor > commenter > viewer`
- Cross-company share links: recipient-bound (email-verified via magic
  link) or signed (bearer-token) modes, both revocable and expirable
- Full audit log per artifact: views, saves, link activity, permission
  changes, comments, integrity failures
- Soft-locked collaborative editing with lock takeover, always audited
- Page-wise editing: decks made of top-level `<section>` elements can be
  edited page by page (select, add, delete, reorder), each with a live
  per-page preview, while saving still always appends a new immutable
  version
- Visual editor: a Canva-style "studio" (page rail, live canvas, Design/
  Assistant dock) for direct-manipulation editing — click to select,
  double-click to edit text inline, adjust color/font/alignment/background/
  radius/padding, replace images, duplicate/delete/reorder elements — all
  inside an opaque-origin sandboxed iframe, with the saved HTML always
  cleaned of editor markup before it becomes a new version
- AI assistant (bring your own key or platform credits): describe an edit
  in plain English and have it rewritten by Claude for the selected page,
  constrained to the same no-network safety envelope as the render sandbox
- Threaded comments, attributable to internal users or verified external
  recipients
- Sensitivity labels (MS Purview-compatible): per-org label taxonomy
  (`Public`/`Internal`/`Confidential`/`Highly Confidential` seeded by
  default), each with a color, rank, stable GUID (paste in a real
  Microsoft tenant label GUID for interop), and server-enforced policy —
  whether external/anyone-with-link sharing is allowed, whether the AI
  assistant may touch the content, a maximum link expiry, and whether a
  watermark is required. Managed at `/labels`, assigned per artifact via
  `PATCH /api/artifacts/[id]/label`. A watermark label overlays a dynamic
  diagonal mark (label + viewer identity) in the viewer chrome only — it
  never touches the artifact bytes or its SHA-256 fingerprint
- PDF/DOCX export (`GET /api/export/pdf|docx`): headless-Chromium PDF (one
  page per top-level `<section>`, backgrounds/gradients preserved) and
  html-to-docx DOCX (inline formatting/alignment preserved), both
  integrity-checked before export and fully audited. Labeled artifacts get
  MSIP-compatible metadata written into the export — real
  `MSIP_Label_<guid>_*` custom properties in DOCX's `docProps/custom.xml`,
  the same key/value pairs in the PDF's `Keywords` field plus a stamped
  watermark/banner — so Microsoft DLP and endpoint tooling recognize the
  classification outside ShareLock too (classification/marking only; RMS/AIP
  encryption-backed labels are out of scope and would need Microsoft's MIP
  SDK)
- Encryption at rest: version HTML is stored AES-256-GCM encrypted
  (`lib/versions.js`, the single read/write path), keyed from
  `SHARELOCK_DATA_KEY` or an HKDF-derived key. The SHA-256 fingerprint is
  computed over the plaintext, so Section 1's decrypt → re-hash → compare
  integrity protocol is unchanged; a failed decryption is itself an
  integrity violation. Legacy plaintext rows remain readable
- Quick-share expiry & auto-delete: anonymous front-page shares now require
  a 1/7/30-day expiry (default 7); once every link on an anonymous artifact
  has expired or been revoked, `lib/purge.js` permanently deletes it —
  versions, links, comments, and audit rows — backing the front page's
  no-sign-in / encrypted-at-rest / not-kept-after-expiry promise. The
  success card also offers a "Download options" reveal for PDF/DOC via the
  link token
- Owner-only analytics dashboard per artifact (`/artifacts/[id]/analytics`,
  API `/api/artifacts/[id]/analytics`): views over 30 days, unique viewers,
  channel breakdown (members / verified recipients / anyone-with-link),
  exports, AI edits, comments, share-link status, and recent activity —
  built entirely from existing server-side audit logs, with no tracking
  code added to artifacts
- Dev-mode email outbox at `/outbox` — no SMTP required to try the full flow
- "GRAPHITE / VOLT" design system (see [DESIGN.md](DESIGN.md)): ink-on-paper
  palette with a single volt-yellow accent, zero border-radius with chamfered
  ("cybertruck") corners, hard offset shadows, mono type for all data, and a
  hand-drawn scribble layer for warmth — one scribble per view. No blur, no
  gradients, no webfonts, no animated backdrops: every surface is flat and
  paints fast

## Quickstart

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Deploy

See [DEPLOY.md](./DEPLOY.md) for simple, step-by-step deployment to Vercel,
including the two serverless gotchas (SQLite persistence and headless
Chromium for PDF export) and how to handle them.

## Demo flow

1. Register an organization (or join one with its join code) — or sign in
   via the simulated Microsoft button, which stands in for real Outlook SSO
   when no Microsoft credentials are configured (`/dev/outlook`).
2. Create a safe link from the front page (paste a link or drop an .html file).
3. Share the artifact — create a share link (recipient-bound or signed).
4. Open `/outbox` to see the share email (and, for recipient-bound links,
   the magic-link email) that would have been sent.
5. Open the magic link as the recipient to verify the email and view the
   artifact.

## Environment variables

| variable | required | purpose |
|---|---|---|
| `SHARELOCK_SECRET` | no | HMAC signing key for share-link grant cookies and magic-link tokens. If unset in development, one is auto-generated and persisted to `data/` so it survives restarts. Must be set explicitly in production. |
| `SHARELOCK_DB_PATH` | no | Path to the SQLite database file. Defaults to a local path under `data/` if unset. |
| `MS_CLIENT_ID` | no | Microsoft Entra ID application (client) ID for Outlook SSO. If unset, the `/dev/outlook` development simulator stands in for real Microsoft sign-in, and the real callback endpoint is unavailable. |
| `MS_CLIENT_SECRET` | no | Microsoft Entra ID client secret, used for the confidential-client authorization-code exchange. |
| `MS_TENANT` | no | Microsoft Entra ID tenant to authenticate against. Defaults to `"common"`. |
| `SHARELOCK_ANTHROPIC_KEY` | no | Anthropic API key used to fund the AI editing assistant from the org's platform credits (`orgs.ai_credits`). Only needed if you want AI edits to work without every user supplying their own key. |
| `SHARELOCK_DATA_KEY` | no | 32-byte, base64url-encoded key used to AES-256-GCM encrypt version HTML at rest. If unset, an encryption key is HKDF-derived from `SHARELOCK_SECRET` instead. |
| `SHARELOCK_CHROMIUM_PATH` | no | Path to a Chromium binary used for headless PDF export. Auto-detected in development if unset; set explicitly in production if no compatible Chromium is found automatically. |
| `NEXT_PUBLIC_SITE_URL` | no | Your public site origin (e.g. `https://your-app.vercel.app`). Used for canonical URLs, OpenGraph tags, `sitemap.xml`, and `robots.txt`. Defaults to `http://localhost:3000`. |

The AI editing assistant always needs an Anthropic API key from one of two
places: a user's own key, entered in the Assistant panel and stored only in
that user's browser, or the org's platform credits, which require
`SHARELOCK_ANTHROPIC_KEY` to be set on the server.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router, plain JavaScript)
- SQLite via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- No client framework beyond what Next.js/React provides — artifacts
  themselves are rendered as raw sandboxed HTML, not React components

See [PROTOCOL.md](./PROTOCOL.md) for the full specification of the
integrity, sandboxing, identity, sharing, audit, collaboration, email, and
sensitivity-label/document-egress mechanisms summarized above.

## Project structure

```
.
├── app/                  # Next.js App Router pages
│   ├── page.js + quick-share.js  # the front page: link or .html file → safe link
│   ├── faq/                     # SEO FAQ + HTML-to-PDF converter comparison
│   ├── robots.js + sitemap.js   # SEO metadata routes
│   ├── ...                    # dashboard, artifact viewer, /outbox, auth pages
│   ├── artifacts/[id]/edit/    # visual "studio" editor (page rail, canvas, Design/Assistant dock)
│   ├── artifacts/[id]/analytics/  # owner-only per-artifact analytics dashboard
│   ├── labels/                  # org admin UI for the sensitivity-label taxonomy
│   ├── dev/outlook/            # development Microsoft-sign-in simulator (only reachable when MS_CLIENT_ID is unset)
│   └── api/                    # Next.js route handlers
│       ├── quick/                   # POST — anonymous one-step share (link import or .html upload)
│       ├── render/[versionId]/     # GET — sandboxed artifact render endpoint
│       ├── auth/outlook/           # Outlook SSO: authorization redirect + /callback
│       ├── auth/magic/request-login/  # POST — issue a passwordless sign-in link
│       ├── ai/edit/                # POST — AI editing assistant (rewrites the selected page)
│       ├── ai/credits/             # GET — org's remaining AI credits + whether a platform key is configured
│       ├── export/[format]/        # GET — PDF/DOCX export (integrity-checked, label-marked, audited)
│       ├── labels/                 # sensitivity-label taxonomy CRUD (per org)
│       ├── artifacts/[id]/label/   # PATCH — assign/clear an artifact's sensitivity label
│       ├── artifacts/[id]/analytics/  # GET — owner-only analytics for one artifact
│       └── ...                     # artifacts, versions, share links, comments, auth
├── lib/
│   ├── db.js             # SQLite connection + schema/queries (seeds the public quick-share account)
│   ├── crypto.js         # SHA-256 hashing, HMAC signing, token generation
│   ├── auth.js           # registration, login, session handling
│   ├── access.js         # role checks, share-link resolution, grant verification
│   ├── sso.js            # Microsoft Entra ID OAuth flow, state/pending-SSO cookies
│   ├── pages.js          # page-wise document splitting/reassembly (prefix + pages[] + suffix)
│   ├── import.js         # SSRF-guarded URL fetch for quick-share imports
│   ├── editor-runtime.js # injected visual-editor runtime (selection, inline edit, postMessage, clean serialization)
│   ├── versions.js       # single read/write path for version content — AES-256-GCM encrypt/decrypt, SHA-256 over plaintext
│   ├── labels.js         # sensitivity-label taxonomy, per-org defaults, server-side policy checks, MSIP property builder
│   ├── purge.js          # deletes anonymous quick-share artifacts once all their links have expired/been revoked
│   ├── export/           # htmlToPdf (headless Chromium + pdf-lib) and htmlToDocxBuffer (html-to-docx + MSIP zip post-processing)
│   └── audit.js          # audit log writes/reads
│   └── mail.js           # email composition + dev outbox / SMTP dispatch
└── data/                 # SQLite database file, dev-only secret persistence
```
