"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Comments } from "@/app/components/comments.js";

export default function SharePage({ params, searchParams }) {
  const { token } = params;
  const [state, setState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/share/${token}`);
    const d = await res.json();
    setState(d);
    if (d.status === "granted") {
      const r2 = await fetch(`/api/artifacts/${d.artifactId}?link=${encodeURIComponent(token)}`);
      const d2 = await r2.json();
      if (r2.ok) {
        setDetail(d2);
        setSelectedVersion(d2.artifact.current_version_id);
      } else {
        setErr(d2.error || "failed to load artifact");
      }
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function requestMagic(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const form = new FormData(e.target);
    const res = await fetch("/api/auth/magic/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareToken: token, email: form.get("email") }),
    });
    const d = await res.json();
    if (res.ok) setMsg(d.message);
    else setErr(d.error || "request failed");
  }

  if (!state)
    return (
      <main className="page">
        <div className="container-narrow">
          <div className="skeleton" style={{ height: 200 }}>loading</div>
        </div>
      </main>
    );

  if (state.status === "invalid") {
    const wasMagic = searchParams?.reason === "magic";
    return (
      <main className="page">
        <div className="container-narrow">
          <div className="card" style={{ textAlign: "center" }}>
            <h1>Link unavailable</h1>
            <p className="muted">
              {wasMagic
                ? "That verification link is invalid, expired, or already used. Ask the sender to reshare, or request a new verification email from the original share link."
                : "This share link is invalid, expired, or has been revoked by the owner."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (state.status === "needs_verification") {
    return (
      <main className="page">
        <div className="container-narrow">
          <div className="card">
            <div className="badge badge-ok" style={{ marginBottom: 10 }}>
              🔒 Recipient-bound share
            </div>
            <h1>Verify your email to view</h1>
            <p className="muted small">
              “{state.title}” was shared with specific recipients. Enter your
              email — if you're on the list, we'll send a one-time verification
              link (valid 15 minutes).
            </p>
            {msg && (
              <div className="alert alert-ok">
                {msg} <Link href="/outbox">Open dev outbox →</Link>
              </div>
            )}
            {err && <div className="alert alert-error">{err}</div>}
            <form onSubmit={requestMagic}>
              <label className="field">
                <span>Your email</span>
                <input name="email" type="email" required autoFocus />
              </label>
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                Send verification link
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  // granted
  const versions = detail?.versions || [];
  const current = versions.find((v) => v.id === selectedVersion) || versions[0];
  const canComment = state.role === "commenter";

  return (
    <main className="page">
      <div className="container stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{state.title}</h1>
            <div className="row small">
              <span className={`badge ${state.mode === "recipient" ? "badge-ok" : "badge-warn"}`}>
                {state.mode === "recipient"
                  ? `🔒 verified as ${state.email}`
                  : "shared via link"}
              </span>
              <span className="badge badge-muted">access: {state.role}</span>
              {current && (
                <span className="badge badge-ok" title={`Full SHA-256: ${current.sha256}`}>
                  ✓ integrity verified · {current.sha256.slice(0, 16)}
                </span>
              )}
            </div>
          </div>
        </div>

        {err && <div className="alert alert-error">{err}</div>}

        {current && (
          <iframe
            key={current.id}
            className="viewer-frame"
            sandbox="allow-scripts"
            src={`/api/render/${current.id}?link=${encodeURIComponent(token)}`}
            title={state.title}
          />
        )}
        <p className="muted small" style={{ margin: "-8px 0 0" }}>
          This artifact runs in an isolated sandbox — interactive, but it cannot
          make network requests or access your data. Its SHA-256 fingerprint is
          re-verified by the server on every view; compare it with the sender
          out-of-band to confirm authenticity.
        </p>

        <div className="grid-2">
          <div className="card">
            <h3>Comments</h3>
            {detail && (
              <Comments
                id={detail.artifact.id}
                canComment={canComment}
                version={current?.version_number}
                linkToken={token}
                guestPrompt={state.mode === "signed"}
              />
            )}
            {!canComment && (
              <p className="muted small">You have view-only access. Ask the owner for comment rights.</p>
            )}
          </div>
          <div className="card">
            <h3>Versions</h3>
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
                    boxShadow: "none",
                    borderColor: v.id === current?.id ? "var(--primary)" : "var(--border)",
                    background: v.id === current?.id ? "#eef2ff" : "#fff",
                    fontFamily: "inherit",
                    fontSize: "0.85rem",
                  }}
                >
                  <strong>v{v.version_number}</strong>
                  <div className="muted small">{v.author_name} · {v.created_at}</div>
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
