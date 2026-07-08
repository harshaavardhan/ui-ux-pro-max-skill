"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LABEL_COLOR } from "@/lib/constants.js";
import Link from "next/link";

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const emptyForm = {
  name: "",
  color: DEFAULT_LABEL_COLOR,
  rank: 0,
  guid: "",
  watermark: false,
  allowExternal: true,
  allowSigned: true,
  allowAi: true,
  maxExpiryDays: "",
};

function formFromLabel(label) {
  return {
    name: label.name,
    color: label.color,
    rank: label.rank,
    guid: label.guid || "",
    watermark: !!label.watermark,
    allowExternal: !!label.allow_external,
    allowSigned: !!label.allow_signed,
    allowAi: !!label.allow_ai,
    maxExpiryDays: label.max_expiry_days === null || label.max_expiry_days === undefined ? "" : label.max_expiry_days,
  };
}

function LabelForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setError("");
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      {error && <div className="alert alert-error">{error}</div>}
      <label className="field">
        <span>Name</span>
        <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <div className="row">
        <label className="field" style={{ flex: "0 0 auto" }}>
          <span>Color</span>
          <input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} />
        </label>
        <label className="field" style={{ flex: "0 0 auto" }}>
          <span>Rank</span>
          <input
            type="number"
            min={0}
            max={9}
            value={form.rank}
            onChange={(e) => set("rank", Number(e.target.value))}
            style={{ width: 70 }}
          />
        </label>
        <label className="field" style={{ flex: "0 0 auto" }}>
          <span>Max link expiry days</span>
          <input
            type="number"
            min={0}
            placeholder="unlimited"
            value={form.maxExpiryDays}
            onChange={(e) => set("maxExpiryDays", e.target.value)}
            style={{ width: 110 }}
          />
        </label>
      </div>
      <label className="field">
        <span>Purview label GUID</span>
        <input
          type="text"
          className="mono"
          placeholder="optional — paste your tenant label GUID"
          value={form.guid}
          onChange={(e) => set("guid", e.target.value)}
        />
      </label>
      <div className="row" style={{ flexWrap: "wrap", gap: 16 }}>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={form.watermark}
            onChange={(e) => set("watermark", e.target.checked)}
          />
          <span className="small">Watermark on view &amp; export</span>
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={form.allowExternal}
            onChange={(e) => set("allowExternal", e.target.checked)}
          />
          <span className="small">Allow external share links</span>
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={form.allowSigned}
            onChange={(e) => set("allowSigned", e.target.checked)}
          />
          <span className="small">Allow anyone-with-link (signed) links</span>
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={form.allowAi}
            onChange={(e) => set("allowAi", e.target.checked)}
          />
          <span className="small">Allow AI editing</span>
        </label>
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function policyChips(label) {
  const chips = [];
  chips.push(
    label.watermark
      ? { text: "watermark", cls: "badge-info" }
      : null
  );
  if (!label.allow_external) chips.push({ text: "no external links", cls: "badge-warn" });
  if (!label.allow_signed) chips.push({ text: "recipient-bound only", cls: "badge-warn" });
  if (!label.allow_ai) chips.push({ text: "AI blocked", cls: "badge-danger" });
  if (label.max_expiry_days) chips.push({ text: `max ${label.max_expiry_days}d links`, cls: "badge-muted" });
  return chips.filter(Boolean);
}

export default function LabelsPage() {
  const [labels, setLabels] = useState(null);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api("/api/labels");
      setLabels(d.labels);
    } catch (e) {
      if (e.status === 401) setUnauthorized(true);
      else setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(form) {
    await api("/api/labels", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setCreating(false);
    await load();
  }

  async function handleUpdate(id, form) {
    await api("/api/labels", {
      method: "PATCH",
      body: JSON.stringify({ id, ...form }),
    });
    setEditingId(null);
    await load();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this label? It will be removed from any artifacts using it.")) return;
    try {
      await api("/api/labels", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      await load();
    } catch (e) {
      alert(e.message);
    }
  }

  if (unauthorized) {
    return (
      <main className="page">
        <div className="container" style={{ maxWidth: 900 }}>
          <div className="alert alert-error">
            You need to sign in to manage sensitivity labels. <Link href="/login">Go to login</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 900 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1>Sensitivity labels</h1>
            <p className="muted">
              Labels classify artifacts, add watermarks, and restrict sharing/AI by policy. They are
              embedded into PDF/DOCX exports as MS Purview-compatible (MSIP) metadata. Paste your
              Microsoft tenant&apos;s label GUID into a label to make exports match your Purview
              taxonomy.
            </p>
          </div>
          {!creating && (
            <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
              + New label
            </button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="stack">
          {creating && (
            <div className="card">
              <LabelForm
                initial={emptyForm}
                onSave={handleCreate}
                onCancel={() => setCreating(false)}
              />
            </div>
          )}

          {labels === null && <p className="muted small">Loading…</p>}

          {labels &&
            labels.map((label) =>
              editingId === label.id ? (
                <div className="card" key={label.id}>
                  <LabelForm
                    initial={formFromLabel(label)}
                    onSave={(form) => handleUpdate(label.id, form)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              ) : (
                <div className="card" key={label.id}>
                  <div className="row" style={{ alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        background: label.color,
                        display: "inline-block",
                        flex: "0 0 auto",
                      }}
                    />
                    <strong>{label.name}</strong>
                    <span className="badge badge-muted">rank {label.rank}</span>
                    <span className="mono muted small">{label.guid}</span>
                    <span style={{ flex: 1 }} />
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(label.id)}>
                      Edit
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(label.id)}>
                      Delete
                    </button>
                  </div>
                  <div className="row small muted" style={{ marginTop: 8, gap: 6 }}>
                    {policyChips(label).map((chip, i) => (
                      <span className={`badge ${chip.cls}`} key={i}>
                        {chip.text}
                      </span>
                    ))}
                  </div>
                </div>
              )
            )}

          {labels && labels.length === 0 && !creating && (
            <p className="muted small">No labels yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
