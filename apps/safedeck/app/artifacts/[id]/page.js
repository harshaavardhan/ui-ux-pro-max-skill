"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Comments } from "@/app/components/comments.js";
import { LabelBadge, LabelPicker } from "@/app/components/labels.js";
import { WindowBar } from "@/app/components/window-bar.js";

function WatermarkOverlay({ text }) {
  return (
    <div className="wm-overlay" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <span key={i}>{text}</span>
      ))}
    </div>
  );
}

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export default function ArtifactPage({ params }) {
  const { id } = params;
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [tab, setTab] = useState("comments");

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/artifacts/${id}`);
      setData(d);
      setSelectedVersion((v) => v || d.artifact.current_version_id);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error)
    return (
      <main className="page">
        <div className="container">
          <div className="alert alert-error">{error}</div>
          <Link href="/dashboard">← Back to artifacts</Link>
        </div>
      </main>
    );
  if (!data)
    return (
      <main className="page">
        <div className="container">
          <div className="skeleton" style={{ height: 400 }}>loading</div>
        </div>
      </main>
    );

  const { artifact, versions, access, label, viewerIdentity } = data;
  const current = versions.find((v) => v.id === selectedVersion) || versions[0];
  const isLatest = current?.id === artifact.current_version_id;
  const watermarkText = label?.watermark
    ? `${label.name} · ${viewerIdentity || ""}`
    : null;

  return (
    <main className="page">
      <div className="container stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{artifact.title}</h1>
            <div className="row small">
              <span className={`badge ${access.isOwner ? "badge-info" : "badge-muted"}`}>
                your role: {access.role}
              </span>
              <LabelBadge label={label} />
              {access.isOwner && (
                <LabelPicker
                  artifactId={id}
                  current={label}
                  onChanged={() => load()}
                />
              )}
              {current && (
                <>
                  <span className="badge badge-muted">v{current.version_number}{isLatest ? " (latest)" : ""}</span>
                  <span className="badge badge-ok" title={`Full SHA-256: ${current.sha256}`}>
                    ✓ integrity verified · {current.sha256.slice(0, 16)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="row">
            {current && (
              <>
                <a className="btn btn-secondary btn-sm" href={`/api/export/pdf?artifact=${id}&version=${current.id}`}>
                  ↓ PDF
                </a>
                <a className="btn btn-secondary btn-sm" href={`/api/export/docx?artifact=${id}&version=${current.id}`}>
                  ↓ DOC
                </a>
              </>
            )}
            {access.isOwner && (
              <Link href={`/artifacts/${id}/analytics`} className="btn btn-secondary btn-sm">
                Analytics
              </Link>
            )}
            {access.canEdit && (
              <Link href={`/artifacts/${id}/edit`} className="btn btn-secondary">
                Edit (new version)
              </Link>
            )}
            <Link href="/dashboard" className="btn btn-secondary btn-sm">
              ← All artifacts
            </Link>
          </div>
        </div>

        {current ? (
          <div>
            <WindowBar title={`${artifact.title} — v${current.version_number}`} />
            <div className="viewer-wrap" style={{ marginTop: 0 }}>
              <iframe
                key={current.id}
                className="viewer-frame"
                sandbox="allow-scripts"
                src={`/api/render/${current.id}`}
                title={artifact.title}
                style={{ borderTop: "none", borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
              />
              {watermarkText && <WatermarkOverlay text={watermarkText} />}
            </div>
          </div>
        ) : (
          <div className="alert alert-warn">No versions yet.</div>
        )}
        <p className="muted small" style={{ margin: "-8px 0 0" }}>
          Rendered in an isolated sandbox: scripts run, but the artifact cannot
          access this app or make any network request. Content hash is
          re-verified server-side on every view.
        </p>

        <div className="grid-2">
          <div className="stack">
            <div className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                {["comments", ...(access.isOwner ? ["sharing", "people", "audit"] : [])].map((t) => (
                  <button
                    key={t}
                    className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "comments" ? "Comments" : t === "sharing" ? "Share links" : t === "people" ? "People & roles" : "Audit log"}
                  </button>
                ))}
              </div>
              {tab === "comments" && (
                <Comments id={id} canComment={access.canComment} version={current?.version_number} />
              )}
              {tab === "sharing" && access.isOwner && <Sharing id={id} />}
              {tab === "people" && access.isOwner && <People id={id} />}
              {tab === "audit" && access.isOwner && <Audit id={id} />}
            </div>
          </div>

          <div className="card">
            <h3>Version history</h3>
            <p className="muted small">Versions are immutable — every edit appends.</p>
            <div className="stack" style={{ gap: 8 }}>
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersion(v.id)}
                  className="card"
                  style={{
                    padding: "10px 12px",
                    textAlign: "left",
                    cursor: "pointer",
                    boxShadow: "none", borderRadius: 0,
                    border: v.id === current?.id ? "2px solid var(--ink)" : "2px solid var(--hairline)",
                    background: v.id === current?.id ? "var(--volt-soft)" : "#fff",
                    fontFamily: "inherit",
                    fontSize: "0.85rem",
                  }}
                >
                  <strong>v{v.version_number}</strong>
                  {v.id === artifact.current_version_id && (
                    <span className="badge badge-info" style={{ marginLeft: 6 }}>latest</span>
                  )}
                  <div className="muted small">
                    {v.author_name} · {v.created_at}
                  </div>
                  {v.note && <div className="small">{v.note}</div>}
                  <div className="mono muted">{v.sha256.slice(0, 20)}…</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Sharing({ id }) {
  const [links, setLinks] = useState([]);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState(null);
  const [mode, setMode] = useState("recipient");

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/artifacts/${id}/links`);
      setLinks(d.links);
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setErr("");
    setCreated(null);
    const form = new FormData(e.target);
    try {
      const d = await api(`/api/artifacts/${id}/links`, {
        method: "POST",
        body: JSON.stringify({
          mode,
          role: form.get("role"),
          recipients: form.get("recipients"),
          expiresAt: form.get("expiresAt") || null,
          message: form.get("message"),
        }),
      });
      setCreated(d.url);
      e.target.reset();
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function revoke(linkId) {
    await api(`/api/artifacts/${id}/links`, {
      method: "PATCH",
      body: JSON.stringify({ linkId }),
    });
    load();
  }

  return (
    <div className="stack">
      {err && <div className="alert alert-error">{err}</div>}
      {created && (
        <div className="alert alert-ok">
          Link created and emailed (dev: see <Link href="/outbox">/outbox</Link>).
          <div className="mono" style={{ wordBreak: "break-all", marginTop: 4 }}>{created}</div>
        </div>
      )}
      <form onSubmit={create} className="stack" style={{ gap: 10 }}>
        <div className="row">
          <button
            type="button"
            className={`btn btn-sm ${mode === "recipient" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMode("recipient")}
          >
            Recipient-bound (verified email)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === "signed" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setMode("signed")}
          >
            Anyone with the link
          </button>
        </div>
        {mode === "signed" && (
          <div className="alert alert-warn" style={{ margin: 0 }}>
            Lower assurance: anyone who obtains this link can view until it
            expires or you revoke it.
          </div>
        )}
        <label className="field" style={{ margin: 0 }}>
          <span>Recipient emails {mode === "recipient" ? "(required — link only works for these)" : "(optional — they'll get the link by email)"}</span>
          <input name="recipients" type="text" placeholder="alice@partner.com, bob@partner.com" required={mode === "recipient"} />
        </label>
        <div className="row">
          <label className="field" style={{ margin: 0, flex: 1 }}>
            <span>Access level</span>
            <select name="role" defaultValue="viewer">
              <option value="viewer">View only</option>
              <option value="commenter">View + comment</option>
            </select>
          </label>
          <label className="field" style={{ margin: 0, flex: 1 }}>
            <span>Expires (optional)</span>
            <input name="expiresAt" type="datetime-local" />
          </label>
        </div>
        <label className="field" style={{ margin: 0 }}>
          <span>Message to include in the email (optional)</span>
          <input name="message" type="text" placeholder="Here's the Q3 review we discussed" />
        </label>
        <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }}>
          Create link & send
        </button>
      </form>

      {links.length > 0 && (
        <table className="list">
          <thead>
            <tr><th>Mode</th><th>Role</th><th>Recipients</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {links.map((l) => {
              const expired = l.expires_at && new Date(l.expires_at) < new Date();
              return (
                <tr key={l.id}>
                  <td>
                    <span className={`badge ${l.mode === "recipient" ? "badge-ok" : "badge-warn"}`}>
                      {l.mode === "recipient" ? "recipient-bound" : "anyone w/ link"}
                    </span>
                  </td>
                  <td className="muted">{l.role}</td>
                  <td className="small muted" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.recipient_emails || "—"}
                  </td>
                  <td>
                    {l.revoked ? (
                      <span className="badge badge-danger">revoked</span>
                    ) : expired ? (
                      <span className="badge badge-muted">expired</span>
                    ) : (
                      <span className="badge badge-ok">active</span>
                    )}
                  </td>
                  <td>
                    {!l.revoked && !expired && (
                      <button className="btn btn-danger btn-sm" onClick={() => revoke(l.id)}>
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function People({ id }) {
  const [perms, setPerms] = useState([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/artifacts/${id}/permissions`);
      setPerms(d.permissions);
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function grant(e) {
    e.preventDefault();
    setErr("");
    const form = new FormData(e.target);
    try {
      await api(`/api/artifacts/${id}/permissions`, {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), role: form.get("role") }),
      });
      e.target.reset();
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function remove(userId) {
    await api(`/api/artifacts/${id}/permissions`, {
      method: "DELETE",
      body: JSON.stringify({ userId }),
    });
    load();
  }

  return (
    <div className="stack">
      {err && <div className="alert alert-error">{err}</div>}
      <form onSubmit={grant} className="row">
        <input name="email" type="email" placeholder="registered user's email" required style={{ flex: 2 }} />
        <select name="role" defaultValue="viewer" style={{ flex: 1, width: "auto" }}>
          <option value="viewer">viewer</option>
          <option value="commenter">commenter</option>
          <option value="editor">editor</option>
        </select>
        <button className="btn btn-primary btn-sm">Grant</button>
      </form>
      <p className="muted small" style={{ margin: 0 }}>
        Grants access to registered SafeDeck users (any org). For external
        people without accounts, use Share links.
      </p>
      {perms.length > 0 && (
        <table className="list">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Org</th><th>Role</th><th /></tr>
          </thead>
          <tbody>
            {perms.map((p) => (
              <tr key={p.user_id}>
                <td>{p.name}</td>
                <td className="muted small">{p.email}</td>
                <td className="muted small">{p.org_name}</td>
                <td><span className="badge badge-muted">{p.role}</span></td>
                <td>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p.user_id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Audit({ id }) {
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    api(`/api/artifacts/${id}/audit`)
      .then((d) => setEvents(d.events))
      .catch((e) => setErr(e.message));
  }, [id]);

  return (
    <div>
      {err && <div className="alert alert-error">{err}</div>}
      {events.length === 0 && <p className="muted small">No events.</p>}
      <table className="list">
        <tbody>
          {events.map((ev, i) => (
            <tr key={i}>
              <td className="small muted" style={{ whiteSpace: "nowrap" }}>{ev.created_at}</td>
              <td><span className="badge badge-muted">{ev.action}</span></td>
              <td className="small">{ev.actor}</td>
              <td className="small muted">{ev.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
