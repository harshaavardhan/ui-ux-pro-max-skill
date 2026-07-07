import { NextResponse } from "next/server";
import { msConfigured, finishSso } from "@/lib/sso.js";
import { fail, handler } from "@/lib/api.js";

// Development-only stand-in for the Microsoft OAuth callback.
// Active ONLY when no real Azure app registration is configured.
export const POST = handler(async (req) => {
  if (msConfigured()) return fail("not found", 404);
  const { email, name } = await req.json();
  const cleanEmail = String(email || "").trim().toLowerCase();
  if (!cleanEmail.includes("@")) return fail("valid email required");

  const { dest, cookies: toSet } = finishSso({
    email: cleanEmail,
    name: String(name || "").trim() || cleanEmail.split("@")[0],
  });
  const res = NextResponse.json({ ok: true, redirect: dest });
  for (const [n, v, opts] of toSet) res.cookies.set(n, v, opts);
  return res;
});
