"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

async function api(path) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function formatShortDay(dayStr) {
  // dayStr is 'YYYY-MM-DD'; render in UTC to match how it was grouped server-side.
  const d = new Date(`${dayStr}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const CHANNEL_COLOR = {
  Members: "var(--primary)",
  "Verified recipients": "var(--accent, #059669)",
  "Anyone-with-link": "var(--warning, #b45309)",
};

export default function AnalyticsPage({ params }) {
  const { id } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/artifacts/${id}/analytics`);
      setData(d);
    } catch (e) {
      setError(e.message);
      setStatus(e.status || 0);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <main className="page">
        <div className="container stack">
          <div className="alert alert-error">
            {status === 401 || status === 403
              ? "You don't have access to view analytics for this artifact."
              : error}
          </div>
          <Link href={`/artifacts/${id}`} className="btn btn-secondary btn-sm">
            ← Artifact
          </Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <div className="container">
          <div className="skeleton" style={{ height: 300 }}>loading</div>
        </div>
      </main>
    );
  }

  const { title, totals, viewsByDay, viewsByChannel, links, recentEvents } = data;
  const maxViews = Math.max(1, ...viewsByDay.map((v) => v.views));
  const allZero = viewsByDay.every((v) => v.views === 0);
  const maxChannel = Math.max(1, ...viewsByChannel.map((c) => c.count));

  const kpis = [
    { label: "Views", value: totals.views },
    { label: "Unique viewers", value: totals.uniqueViewers },
    { label: "Exports", value: totals.exports },
    { label: "AI edits", value: totals.aiEdits },
    { label: "Comments", value: totals.comments },
  ];

  return (
    <main className="page">
      <div className="container stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1>Analytics — {title}</h1>
          <Link href={`/artifacts/${id}`} className="btn btn-secondary btn-sm">
            ← Artifact
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          {kpis.map((k) => (
            <div className="card" key={k.label}>
              <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{k.value}</div>
              <div className="muted small">{k.label}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Views — last 30 days</h3>
          {allZero ? (
            <p className="muted small">No views yet.</p>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              <div className="muted small">{maxViews}</div>
              <div
                className="row"
                style={{
                  height: 120,
                  alignItems: "flex-end",
                  gap: 2,
                  justifyContent: "flex-start",
                }}
              >
                {viewsByDay.map((v) => {
                  const h = Math.max(2, Math.round((v.views / maxViews) * 118));
                  return (
                    <div
                      key={v.day}
                      title={`${formatShortDay(v.day)} — ${v.views} view${v.views === 1 ? "" : "s"}`}
                      style={{
                        flex: 1,
                        height: h,
                        background: "var(--primary)",
                        opacity: 0.85,
                        borderRadius: "3px 3px 0 0",
                        minWidth: 4,
                      }}
                    />
                  );
                })}
              </div>
              <div className="row muted small" style={{ justifyContent: "space-between" }}>
                <span>{formatShortDay(viewsByDay[0].day)}</span>
                <span>{formatShortDay(viewsByDay[Math.floor(viewsByDay.length / 2)].day)}</span>
                <span>{formatShortDay(viewsByDay[viewsByDay.length - 1].day)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3>Where views come from</h3>
          {viewsByChannel.every((c) => c.count === 0) ? (
            <p className="muted small">No views yet.</p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {viewsByChannel.map((c) => (
                <div
                  key={c.channel}
                  className="row"
                  style={{ alignItems: "center", gap: 10 }}
                >
                  <div className="small" style={{ width: 150, flexShrink: 0 }}>
                    {c.channel}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        width: `${Math.max(2, Math.round((c.count / maxChannel) * 100))}%`,
                        height: 10,
                        borderRadius: 999,
                        background: CHANNEL_COLOR[c.channel] || "var(--primary)",
                      }}
                    />
                  </div>
                  <div className="mono small" style={{ width: 30, textAlign: "right" }}>
                    {c.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Share links</h3>
          {links.length === 0 ? (
            <p className="muted small">No share links created yet.</p>
          ) : (
            <>
              <table className="list">
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>Role</th>
                    <th>Recipients</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <span className={`badge ${l.mode === "recipient" ? "badge-ok" : "badge-warn"}`}>
                          {l.mode === "recipient" ? "recipient-bound" : "anyone w/ link"}
                        </span>
                      </td>
                      <td className="muted">{l.role}</td>
                      <td
                        className="small muted"
                        style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {l.recipients || "—"}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            l.status === "active"
                              ? "badge-ok"
                              : l.status === "expired"
                              ? "badge-muted"
                              : "badge-danger"
                          }`}
                        >
                          {l.status}
                        </span>
                      </td>
                      <td className="muted small" style={{ whiteSpace: "nowrap" }}>
                        {l.created_at}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>
                Opens are tracked per channel; per-link attribution coming later.
              </p>
            </>
          )}
        </div>

        <div className="card">
          <h3>Recent activity</h3>
          {recentEvents.length === 0 ? (
            <p className="muted small">No activity yet.</p>
          ) : (
            <table className="list">
              <tbody>
                {recentEvents.map((ev, i) => (
                  <tr key={i}>
                    <td className="small muted" style={{ whiteSpace: "nowrap" }}>
                      {ev.created_at}
                    </td>
                    <td>
                      <span className="badge badge-muted">{ev.action}</span>
                    </td>
                    <td className="small">{ev.actor}</td>
                    <td className="small muted">{ev.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
