import { NextResponse } from "next/server";
import { msConfigured, msAuthorizeUrl } from "@/lib/sso.js";
import { randomToken } from "@/lib/crypto.js";
import { handler } from "@/lib/api.js";

export const GET = handler(async (req) => {
  const origin = new URL(req.url).origin;
  if (!msConfigured()) {
    // No Azure app registered: hand off to the development simulator.
    return NextResponse.redirect(new URL("/dev/outlook", origin));
  }
  const state = randomToken(16);
  const res = NextResponse.redirect(msAuthorizeUrl(origin, state));
  res.cookies.set("sd_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
});
