import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { json, handler } from "@/lib/api.js";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = requireUser();
  const org = db.prepare("SELECT ai_credits FROM orgs WHERE id = ?").get(user.org_id);
  return json({
    credits: org?.ai_credits ?? 0,
    platformKeyConfigured: Boolean(process.env.SAFEDECK_ANTHROPIC_KEY),
  });
});
