import db from "@/lib/db.js";
import { requireUser } from "@/lib/auth.js";
import { seedDefaultLabels } from "@/lib/labels.js";
import { randomId, randomUuid } from "@/lib/crypto.js";
import { json, fail, handler } from "@/lib/api.js";

export const dynamic = "force-dynamic";

const GUID_RE = /^[0-9a-fA-F-]{36}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeFields(body) {
  const name = String(body.name || "").trim();
  const color = COLOR_RE.test(String(body.color || "")) ? body.color : "#6366f1";
  const rank = Number.isFinite(Number(body.rank)) ? Number(body.rank) : 0;
  const watermark = body.watermark ? 1 : 0;
  const allowExternal = body.allowExternal ? 1 : 0;
  const allowSigned = body.allowSigned ? 1 : 0;
  const allowAi = body.allowAi ? 1 : 0;
  const maxExpiryDays =
    body.maxExpiryDays === null || body.maxExpiryDays === undefined || body.maxExpiryDays === ""
      ? null
      : Number(body.maxExpiryDays);
  return { name, color, rank, watermark, allowExternal, allowSigned, allowAi, maxExpiryDays };
}

export const GET = handler(async () => {
  const user = requireUser();
  seedDefaultLabels(user.org_id);
  const labels = db
    .prepare("SELECT * FROM labels WHERE org_id = ? ORDER BY rank ASC")
    .all(user.org_id);
  return json({ labels });
});

export const POST = handler(async (req) => {
  const user = requireUser();
  const body = await req.json();
  const { name, color, rank, watermark, allowExternal, allowSigned, allowAi, maxExpiryDays } =
    normalizeFields(body);
  if (!name) return fail("name required");

  const guid = GUID_RE.test(String(body.guid || "")) ? body.guid : randomUuid();
  const id = randomId("lbl");

  db.prepare(
    `INSERT INTO labels (id, org_id, guid, name, color, rank, watermark, allow_external, allow_signed, allow_ai, max_expiry_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, user.org_id, guid, name, color, rank, watermark, allowExternal, allowSigned, allowAi, maxExpiryDays);

  const created = db.prepare("SELECT * FROM labels WHERE id = ?").get(id);
  return json({ label: created });
});

export const PATCH = handler(async (req) => {
  const user = requireUser();
  const body = await req.json();
  const { id } = body;
  if (!id) return fail("id required");

  const existing = db
    .prepare("SELECT * FROM labels WHERE id = ? AND org_id = ?")
    .get(id, user.org_id);
  if (!existing) return fail("not found", 404);

  const { name, color, rank, watermark, allowExternal, allowSigned, allowAi, maxExpiryDays } =
    normalizeFields(body);
  if (!name) return fail("name required");

  const guid = GUID_RE.test(String(body.guid || "")) ? body.guid : existing.guid;

  db.prepare(
    `UPDATE labels
     SET guid = ?, name = ?, color = ?, rank = ?, watermark = ?, allow_external = ?, allow_signed = ?, allow_ai = ?, max_expiry_days = ?
     WHERE id = ? AND org_id = ?`
  ).run(guid, name, color, rank, watermark, allowExternal, allowSigned, allowAi, maxExpiryDays, id, user.org_id);

  const updated = db.prepare("SELECT * FROM labels WHERE id = ?").get(id);
  return json({ label: updated });
});

export const DELETE = handler(async (req) => {
  const user = requireUser();
  const { id } = await req.json();
  if (!id) return fail("id required");

  const existing = db
    .prepare("SELECT * FROM labels WHERE id = ? AND org_id = ?")
    .get(id, user.org_id);
  if (!existing) return fail("not found", 404);

  const tx = db.transaction(() => {
    db.prepare("UPDATE artifacts SET label_id = NULL WHERE label_id = ?").run(id);
    db.prepare("DELETE FROM labels WHERE id = ? AND org_id = ?").run(id, user.org_id);
  });
  tx();

  return json({ ok: true });
});
