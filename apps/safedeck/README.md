# SafeDeck

SafeDeck is an enterprise platform for safely sharing interactive HTML
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

- One-step anonymous sharing (the front page): paste HTML, upload an `.html`
  file, or import a URL, and get a safe, sandboxed, tamper-evident link
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
- Dev-mode email outbox at `/outbox` — no SMTP required to try the full flow
- Refreshed "Aurora" visual design (mesh-gradient backdrop, glass cards,
  Poppins/Open Sans), with the new visual editor styled as a "studio" layer
  on top — frosted-glass panels, a mesh-gradient backdrop, and soft depth
  shadows drawing on the liquid-glass / Spatial-UI (VisionOS) and Liquid
  Glass aesthetics

## Quickstart

```bash
cd apps/safedeck
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Demo flow

1. Register an organization (or join one with its join code) — or sign in
   via the simulated Microsoft button, which stands in for real Outlook SSO
   when no Microsoft credentials are configured (`/dev/outlook`).
2. Create a new artifact and paste in some HTML.
3. Share the artifact — create a share link (recipient-bound or signed).
4. Open `/outbox` to see the share email (and, for recipient-bound links,
   the magic-link email) that would have been sent.
5. Open the magic link as the recipient to verify the email and view the
   artifact.

## Environment variables

| variable | required | purpose |
|---|---|---|
| `SAFEDECK_SECRET` | no | HMAC signing key for share-link grant cookies and magic-link tokens. If unset in development, one is auto-generated and persisted to `data/` so it survives restarts. Must be set explicitly in production. |
| `SAFEDECK_DB_PATH` | no | Path to the SQLite database file. Defaults to a local path under `data/` if unset. |
| `MS_CLIENT_ID` | no | Microsoft Entra ID application (client) ID for Outlook SSO. If unset, the `/dev/outlook` development simulator stands in for real Microsoft sign-in, and the real callback endpoint is unavailable. |
| `MS_CLIENT_SECRET` | no | Microsoft Entra ID client secret, used for the confidential-client authorization-code exchange. |
| `MS_TENANT` | no | Microsoft Entra ID tenant to authenticate against. Defaults to `"common"`. |
| `SAFEDECK_ANTHROPIC_KEY` | no | Anthropic API key used to fund the AI editing assistant from the org's platform credits (`orgs.ai_credits`). Only needed if you want AI edits to work without every user supplying their own key. |

The AI editing assistant always needs an Anthropic API key from one of two
places: a user's own key, entered in the Assistant panel and stored only in
that user's browser, or the org's platform credits, which require
`SAFEDECK_ANTHROPIC_KEY` to be set on the server.

## Tech stack

- [Next.js 14](https://nextjs.org/) (App Router, plain JavaScript)
- SQLite via [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
- No client framework beyond what Next.js/React provides — artifacts
  themselves are rendered as raw sandboxed HTML, not React components

See [PROTOCOL.md](./PROTOCOL.md) for the full specification of the
integrity, sandboxing, identity, sharing, audit, collaboration, and email
mechanisms summarized above.

## Project structure

```
apps/safedeck/
├── app/                  # Next.js App Router pages
│   ├── page.js + quick-share.js  # the simple front page: paste/upload/import → safe link
│   ├── ...                    # dashboard, artifact viewer, /outbox, auth pages
│   ├── artifacts/[id]/edit/    # visual "studio" editor (page rail, canvas, Design/Assistant dock)
│   ├── dev/outlook/            # development Microsoft-sign-in simulator (only reachable when MS_CLIENT_ID is unset)
│   └── api/                    # Next.js route handlers
│       ├── quick/                   # POST — anonymous one-step share (paste HTML or import a URL)
│       ├── render/[versionId]/     # GET — sandboxed artifact render endpoint
│       ├── auth/outlook/           # Outlook SSO: authorization redirect + /callback
│       ├── auth/magic/request-login/  # POST — issue a passwordless sign-in link
│       ├── ai/edit/                # POST — AI editing assistant (rewrites the selected page)
│       ├── ai/credits/             # GET — org's remaining AI credits + whether a platform key is configured
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
│   └── audit.js          # audit log writes/reads
│   └── mail.js           # email composition + dev outbox / SMTP dispatch
└── data/                 # SQLite database file, dev-only secret persistence
```
