"use client";

import { useState } from "react";
import Link from "next/link";
import { ExportButtons } from "@/app/components/export-buttons.js";

// Keyword-first hero headline, rendered in the jittered "marker" treatment.
// Each word wraps as a unit; letters jitter within it.
const HERO_HEADLINE = "Convert HTML to PDF";
const HERO_LETTERS = HERO_HEADLINE.toUpperCase()
  .split(" ")
  .map((word, wi) => (
    <span className="hero-w" key={wi}>
      {word.split("").map((ch, ci) => (
        <span key={ci} aria-hidden="true">{ch}</span>
      ))}
    </span>
  ));

export function QuickShare({ loggedIn }) {
  const [url, setUrl] = useState("");
  const [fileHtml, setFileHtml] = useState("");
  const [fileName, setFileName] = useState("");
  const [expiryDays, setExpiryDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
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
        <p className="hero-eyebrow">Free · No sign-up · Private by default</p>
        <h1 className="hero-word" aria-label={HERO_HEADLINE}>
          {HERO_LETTERS}
        </h1>
        <p className="hero-tag">
          Turn any HTML page or Claude artifact into a pixel-perfect{" "}
          <strong>PDF</strong> or an editable <strong>Word (DOCX)</strong> file
          — instantly. Your upload is encrypted and auto-deleted; no account
          needed.
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
              <button className="btn btn-primary hero-go" disabled={busy || (!url.trim() && !fileHtml)}>
                {busy ? "Converting…" : "Convert →"}
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
          <div className="card quick-success">
            <div className="quick-check">✓</div>
            <h2>Your file is ready</h2>
            <p className="muted small">
              Download it as a PDF or Word document — or send the safe,
              sandboxed link. The link's fingerprint is verified on every open.
            </p>
            <div className="quick-downloads">
              <ExportButtons artifactId={result.artifactId} linkToken={result.token} variant="lg" />
            </div>
            <div className="quick-linkrow">
              <input className="quick-linkfield mono" readOnly value={result.url} onFocus={(e) => e.target.select()} />
              <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? "Copied!" : "Copy link"}</button>
              <a className="btn btn-secondary btn-sm" href={result.url} target="_blank" rel="noreferrer">Open</a>
            </div>
            <div className="mono muted quick-fingerprint">
              fingerprint {result.sha256.slice(0, 24)}…
              {result.expiresAt && (
                <> · expires {new Date(result.expiresAt).toLocaleDateString()} — then permanently deleted</>
              )}
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
            <button className="quick-another" onClick={reset}>← Convert another page</button>
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
              <Link href="/login">sign in</Link>. New here?{" "}
              <Link href="/faq">See the FAQ &amp; comparison</Link>.
            </>
          )}
        </p>
      )}
    </main>
  );
}
