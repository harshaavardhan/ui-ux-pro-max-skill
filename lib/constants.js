// Shared constants safe for both server and client bundles.

// The product name, for user-facing prose (UI copy, emails, export
// metadata). Wire-format identifiers — SHARELOCK_* env vars, X-ShareLock-*
// headers, the ShareLock_Sensitivity MSIP key, the HKDF info string — stay
// literal on purpose: they are compat surfaces a rebrand must not silently
// change.
export const APP_NAME = "ShareLock";

// Public site origin, used for canonical URLs, OpenGraph, sitemap, robots.
// Set NEXT_PUBLIC_SITE_URL on your host (e.g. Vercel) to your real domain.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const DEFAULT_LABEL_COLOR = "#0e0e10"; // brand ink
