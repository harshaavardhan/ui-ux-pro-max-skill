import { destroySession } from "@/lib/auth.js";
import { json, handler } from "@/lib/api.js";

export const POST = handler(async () => {
  destroySession();
  return json({ ok: true });
});
