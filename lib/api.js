import { NextResponse } from "next/server";

export function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Wraps a route handler: JSON body parsing errors and thrown
// errors with .status become clean JSON error responses.
export function handler(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      return fail(err.status ? err.message : "internal error", status);
    }
  };
}
