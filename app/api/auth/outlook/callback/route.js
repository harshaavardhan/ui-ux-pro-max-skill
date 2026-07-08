import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { msConfigured, msExchangeCode, finishSso } from "@/lib/sso.js";
import { handler } from "@/lib/api.js";

export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const origin = url.origin;
  if (!msConfigured())
    return NextResponse.redirect(new URL("/login?error=sso", origin));

  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expected = cookies().get("sd_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/login?error=sso", origin));
  }

  let identity;
  try {
    identity = await msExchangeCode(origin, code);
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso", origin));
  }

  const { dest, cookies: toSet } = finishSso(identity);
  const res = NextResponse.redirect(new URL(dest, origin));
  res.cookies.delete("sd_oauth_state");
  for (const [name, value, opts] of toSet) res.cookies.set(name, value, opts);
  return res;
});
