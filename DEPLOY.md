# Deploy ShareLock to Vercel

The app is a standard Next.js 14 project at the repo root, so Vercel deploys
it with almost no configuration. Follow the quick path first; then read the
two "gotchas" — they matter because ShareLock uses a local SQLite file and a
headless Chromium for PDF export, neither of which behaves like a normal
Node dependency on Vercel's serverless runtime.

## Quick path (get it live)

1. **Push to GitHub.** Your code is already on `main` in your repo
   (`harshaavardhan/ui-ux-pro-max-skill`). Nothing else to do here.
2. **Import the repo into Vercel.**
   - Go to <https://vercel.com/new> and sign in with GitHub.
   - Pick your repository.
   - Framework preset: **Next.js** (auto-detected).
   - Root Directory: **/** (the repo root — the app lives there now).
   - Leave Build Command and Output Directory as the defaults.
3. **Add environment variables** (Project → Settings → Environment Variables):
   - `SHARELOCK_SECRET` — a long random string (run `openssl rand -base64 32`).
   - `NEXT_PUBLIC_SITE_URL` — your site URL, e.g. `https://your-app.vercel.app`
     (set this after the first deploy tells you the domain, then redeploy).
   - Optional: `SHARELOCK_ANTHROPIC_KEY` (to fund AI edits), `MS_CLIENT_ID` /
     `MS_CLIENT_SECRET` / `MS_TENANT` (real Outlook SSO).
4. **Deploy.** Vercel builds and gives you a live URL.

That's enough to serve the site, the FAQ, and the sharing/viewer flow.
Before relying on it in production, handle the two items below.

## Gotcha 1 — SQLite does not persist on serverless

Vercel's serverless functions have an **ephemeral, mostly read-only**
filesystem. The bundled `better-sqlite3` database (`data/sharelock.db`) will
work within a single request but is **not** shared between requests and is
wiped on every cold start. In practice: created links and accounts can
vanish.

**Options, simplest first:**

- **Turso / libSQL (recommended, minimal change).** Turso is SQLite-compatible
  and serverless-friendly. Create a database at <https://turso.tech>, then
  swap `better-sqlite3` for `@libsql/client` in `lib/db.js` (the query API is
  nearly identical). Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
- **Vercel Postgres / Neon.** More work (SQL dialect differences) but fully
  managed. Port `lib/db.js` to `@vercel/postgres`.
- **Just a demo?** Leave SQLite as-is and accept that data resets — fine for
  showing the converter, not for real accounts.

## Gotcha 2 — PDF export needs a serverless Chromium

PDF export renders HTML with headless Chromium via `playwright-core`. Vercel's
runtime has **no browser installed**, so `/api/export/pdf` will fail until you
give it one. (DOCX export uses `html-to-docx` and works on Vercel as-is.)

**Fix:** use a serverless Chromium build.

1. `npm i @sparticuz/chromium` and keep `playwright-core`.
2. In `lib/export/pdf.js`, when running on Vercel, launch with that binary:
   ```js
   // when process.env.VERCEL is set:
   import chromium from "@sparticuz/chromium";
   const executablePath = await chromium.executablePath();
   // pass executablePath + chromium.args to the launch call
   ```
   Locally it keeps auto-detecting your Chromium as today.
3. Set the function's memory/timeout higher for the export route (Chromium is
   heavy): add to `next.config.mjs` or a route segment config, e.g. `maxDuration = 60`.

If you don't need server-rendered PDFs on day one, you can ship without this
and enable it when you wire up a persistent database.

## After deploy

- Set `NEXT_PUBLIC_SITE_URL` to your real domain and redeploy so canonical
  URLs, OpenGraph, `sitemap.xml`, and `robots.txt` point at the right host.
- Submit `https://your-domain/sitemap.xml` in Google Search Console.
- Your machine-readable summary is served at `/llms.txt`.
