"use client";

import { useState } from "react";
import Link from "next/link";

export function QuickShare({ loggedIn }) {
  const [mode, setMode] = useState("paste"); // paste | url
  const [html, setHtml] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "url" ? { url, title } : { html, title }
        ),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "something went wrong");
      else setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null);
    setHtml("");
    setUrl("");
    setTitle("");
    setError("");
    setCopied(false);
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setMode("paste");
      setHtml(String(reader.result || ""));
      if (!title) setTitle(file.name.replace(/\.html?$/i, ""));
    };
    reader.readAsText(file);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }

  return (
    <main className="page">
      <div className="quick-wrap">
        <h1 className="quick-title">
          Share an HTML page <span className="grad">safely.</span>
        </h1>
        <p className="quick-sub">
          Paste your HTML or a link. Get a safe, sandboxed link you can send to
          anyone — no account needed.
        </p>

        {!result ? (
          <form onSubmit={create} className="quick-card">
            <div className="quick-modes">
              <button type="button" className={`quick-mode ${mode === "paste" ? "active" : ""}`} onClick={() => setMode("paste")}>
                Paste HTML
              </button>
              <button type="button" className={`quick-mode ${mode === "url" ? "active" : ""}`} onClick={() => setMode("url")}>
                Import from URL
              </button>
              <label className="quick-mode as-upload">
                Upload .html
                <input type="file" accept=".html,.htm,text/html" onChange={onFile} hidden />
              </label>
            </div>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {mode === "paste" ? (
              <textarea
                className="quick-textarea"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder={"<!doctype html>\n<html>\n  …paste your page here…\n</html>"}
                spellCheck={false}
              />
            ) : (
              <input
                className="quick-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/report.html"
              />
            )}

            <div className="quick-actions">
              <input
                className="quick-name"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
              />
              <button className="btn btn-primary" disabled={busy || (mode === "paste" ? !html.trim() : !url.trim())}>
                {busy ? "Creating…" : "Create safe link"}
              </button>
            </div>

            <p className="quick-note muted">
              🔒 Tamper-evident (SHA-256) · 🛡️ sandboxed, no data leakage · the
              recipient just opens the link.
            </p>
          </form>
        ) : (
          <div className="quick-card quick-success">
            <div className="quick-check">✓</div>
            <h2 style={{ margin: "0 0 4px" }}>Your safe link is ready</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Anyone with this link can view it. It renders in a locked-down
              sandbox and its fingerprint is verified on every open.
            </p>
            <div className="quick-linkrow">
              <input className="quick-linkfield mono" readOnly value={result.url} onFocus={(e) => e.target.select()} />
              <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
              <a className="btn btn-primary btn-sm" href={result.url} target="_blank" rel="noreferrer">Open</a>
            </div>
            <div className="mono muted" style={{ fontSize: "0.72rem", marginTop: 8 }}>
              fingerprint {result.sha256.slice(0, 24)}…
            </div>

            <div className="quick-editcta">
              {result.mine ? (
                <>
                  <span className="muted small">This artifact is saved to your workspace.</span>
                  <div className="row" style={{ gap: 8 }}>
                    <Link href={`/artifacts/${result.artifactId}/edit`} className="btn btn-secondary btn-sm">Edit visually</Link>
                    <Link href={`/artifacts/${result.artifactId}`} className="btn btn-secondary btn-sm">Manage access</Link>
                  </div>
                </>
              ) : (
                <>
                  <span className="muted small">Want to <strong>edit</strong>, comment, or control who can open it?</span>
                  <Link href="/register" className="btn btn-secondary btn-sm">Sign in to edit</Link>
                </>
              )}
            </div>
            <button className="quick-another" onClick={reset}>← Share another page</button>
          </div>
        )}

        {!result && (
          <p className="quick-signin muted small">
            {loggedIn ? (
              <Link href="/dashboard">Go to your workspace →</Link>
            ) : (
              <>
                Need editing, comments, and access control?{" "}
                <Link href="/register">Create a free workspace</Link> or{" "}
                <Link href="/login">sign in</Link>.
              </>
            )}
          </p>
        )}
      </div>
    </main>
  );
}
