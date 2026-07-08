import { pendingSso } from "@/lib/sso.js";
import { json, fail, handler } from "@/lib/api.js";

export const GET = handler(async () => {
  const pending = pendingSso();
  if (!pending) return fail("no pending sign-in", 404);
  return json(pending);
});
