"use client";

import { useState } from "react";
import Link from "next/link";
import { ExportButtons } from "@/app/components/export-buttons.js";

const WORDMARK = "SHARELOCK";

export function QuickShare({ loggedIn }) {
  const [url, setUrl] = useState("");
  const [fileHtml, setFileHtml] = useState("");
  const [fileName, setFileName] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = fileHtml
        ? { html: fileHtml, title: fileName.replace(/\.html?$/i, ""), expiryDays }
        : { url, expiryDays };
      const res = await fetch("/api/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    setUrl("");
    setFileHtml("");
    setFileName("");
    setError("");
    setCopied(false);
    setShowDownloads(false);
  }

  function readFile(file) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== "text/html") {
      setError("Please drop an .html file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setError("");
      setFileHtml(String(reader.result || ""));
      setFileName(file.name);
      setUrl("");
    };
    reader.readAsText(file);
  }
  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    readFile(e.dataTransfer.files?.[0]);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  }

  return (
    <main
      className="hero"
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={onDrop}
    >
      {dragging && <div className="hero-drop-hint">Drop your .html file</div>}

      <section className="hero-stage">
        <div className="hero-block" aria-hidden="true" />
        <h1 className="hero-word" aria-label={WORDMARK}>
          {WORDMARK.split("").map((ch, i) => (
            <span key={i} aria-hidden="true">{ch}</span>
          ))}
        </h1>
        <p className="hero-tag">
          Paste a Claude artifact link — or drop an HTML file — and send one
          safe, sealed, self-destructing link.
        </p>

        {!result ? (
          <>
            {error && (
              <div className="alert alert-error hero-alert">{error}</div>
            )}
            <form className="hero-bar" onSubmit={create}>
              {fileName ? (
                <div className="hero-file mono">
                  {fileName}
                  <button type="button" onClick={() => { setFileHtml(""); setFileName(""); }} title="Remove file">
                    ✕
                  </button>
                </div>
              ) : (
                <input
                  className="hero-input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a link — Claude artifact or any HTML page"
                />
              )}
              <button className="hero-go" disabled={busy || (!url.trim() && !fileHtml)}>
                {busy ? "Sealing…" : "Create safe link"}
              </button>
            </form>

            <div className="hero-meta">
              <label className="hero-upload">
                or <u>choose an .html file</u> — dropping it anywhere works too
                <input
                  type="file"
                  accept=".html,.htm,text/html"
                  onChange={(e) => readFile(e.target.files?.[0])}
                  hidden
                />
              </label>
              <span className="hero-meta-sep" aria-hidden="true">·</span>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                title="The link — and the data — are deleted after this"
              >
                <option value={1}>Expires in 1 day</option>
                <option value={7}>Expires in 7 days</option>
                <option value={30}>Expires in 30 days</option>
              </select>
            </div>
          </>
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
              {result.expiresAt && (
                <> · expires {new Date(result.expiresAt).toLocaleDateString()} — then permanently deleted</>
              )}
            </div>

            <button className="quick-dl-toggle" onClick={() => setShowDownloads((s) => !s)}>
              Download options
            </button>
            {showDownloads && (
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 10 }}>
                <ExportButtons artifactId={result.artifactId} linkToken={result.token} />
              </div>
            )}

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
      </section>

      <section className="hero-specs">
        <div>
          <strong>AES-256</strong>
          <span>encrypted at rest — never kept in the clear</span>
        </div>
        <div>
          <strong>SHA-256</strong>
          <span>fingerprint re-verified on every open</span>
        </div>
        <div>
          <strong>{expiryDays} {expiryDays === 1 ? "day" : "days"}</strong>
          <span>then the data is permanently deleted</span>
        </div>
      </section>

      {!result && (
        <p className="quick-signin muted small">
          {loggedIn ? (
            <Link href="/dashboard">Go to your workspace →</Link>
          ) : (
            <>
              No account needed. Want editing, comments, and access control?{" "}
              <Link href="/register">Create a free workspace</Link> or{" "}
              <Link href="/login">sign in</Link>.
            </>
          )}
        </p>
      )}
    </main>
  );
}
