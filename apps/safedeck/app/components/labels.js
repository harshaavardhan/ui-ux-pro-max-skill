"use client";

import { useEffect, useState } from "react";

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export function LabelBadge({ label, small }) {
  if (!label) return null;
  return (
    <span
      className="badge"
      style={{
        background: label.color + "1a",
        color: label.color,
        borderColor: label.color + "55",
        fontSize: small ? 11 : undefined,
      }}
    >
      🏷 {label.name}
    </span>
  );
}

export function LabelPicker({ artifactId, current, onChanged }) {
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api("/api/labels")
      .then((d) => {
        if (!cancelled) setLabels(d.labels || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChange(e) {
    const value = e.target.value;
    try {
      const data = await api(`/api/artifacts/${artifactId}/label`, {
        method: "PATCH",
        body: JSON.stringify({ labelId: value || null }),
      });
      const newLabel = value ? labels.find((l) => l.id === value) || null : null;
      onChanged?.(newLabel, data);
    } catch (e2) {
      alert(e2.message);
    }
  }

  return (
    <select
      value={current?.id || ""}
      onChange={handleChange}
      style={{ width: "auto", minWidth: 180 }}
    >
      <option value="">No label</option>
      {labels
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
    </select>
  );
}
