"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { splitPages, joinPages, blankPage } from "@/lib/pages.js";

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

// Preview-only hardening: inject a no-network CSP <meta> so drafts can't
// phone home from the editor either. Served versions get the real CSP
// header from the render endpoint.
const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; font-src data:";
function withPreviewCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  const headMatch = html.match(/<head\b[^>]*>/i);
  if (headMatch) {
    const i = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, i) + meta + html.slice(i);
  }
  return meta + html;
}

export default function EditPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [doc, setDoc] = useState(null); // { supported, prefix, pages, suffix }
  const [pageIdx, setPageIdx] = useState(0);
  const [fullMode, setFullMode] = useState(false);
  const [fullSource, setFullSource] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lockConflict, setLockConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const heartbeatRef = useRef(null);

  const acquireLock = useCallback(
    async (takeover = false) => {
      try {
        const res = await fetch(`/api/artifacts/${id}/lock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ takeover }),
        });
        const data = await res.json();
        if (res.status === 409) {
          setLockConflict(data.lock);
          return false;
        }
        setLockConflict(null);
        return true;
      } catch {
        return false;
      }
    },
    [id]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api(`/api/artifacts/${id}`);
        if (cancelled) return;
        if (!d.access.canEdit) {
          setError("You need editor access to edit this artifact.");
          return;
        }
        setMeta(d);
        const res = await fetch(`/api/render/${d.artifact.current_version_id}`);
        const text = await res.text();
        if (cancelled) return;
        const split = splitPages(text);
        setDoc(split);
        setFullSource(text);
        if (!split.supported) setFullMode(true);
        const ok = await acquireLock(false);
        if (ok) {
          heartbeatRef.current = setInterval(() => acquireLock(false), 30_000);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      fetch(`/api/artifacts/${id}/lock`, { method: "DELETE" }).catch(() => {});
    };
  }, [id, acquireLock]);

  function currentHtml() {
    return fullMode ? fullSource : joinPages(doc);
  }

  function setPageHtml(value) {
    setDoc((d) => {
      const pages = d.pages.slice();
      pages[pageIdx] = value;
      return { ...d, pages };
    });
  }

  function enterFullMode() {
    setFullSource(joinPages(doc));
    setFullMode(true);
  }

  function exitFullMode() {
    const split = splitPages(fullSource);
    setDoc(split);
    setPageIdx(0);
    if (split.supported) setFullMode(false);
    else setError("No top-level <section> pages found — staying in full-source mode.");
  }

  function addPage() {
    setDoc((d) => {
      const pages = d.pages.slice();
      pages.splice(pageIdx + 1, 0, blankPage(pages.length + 1));
      return { ...d, pages };
    });
    setPageIdx((i) => i + 1);
  }

  function deletePage(i) {
    setDoc((d) => {
      if (d.pages.length <= 1) return d;
      const pages = d.pages.slice();
      pages.splice(i, 1);
      return { ...d, pages };
    });
    setPageIdx((cur) => Math.max(0, cur > i ? cur - 1 : Math.min(cur, doc.pages.length - 2)));
  }

  function movePage(i, dir) {
    setDoc((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.pages.length) return d;
      const pages = d.pages.slice();
      [pages[i], pages[j]] = [pages[j], pages[i]];
      return { ...d, pages };
    });
    setPageIdx((cur) => (cur === i ? i + dir : cur === i + dir ? i : cur));
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/artifacts/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({ html: currentHtml(), note }),
      });
      router.push(`/artifacts/${id}`);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !meta)
    return (
      <main className="page">
        <div className="container">
          <div className="alert alert-error">{error}</div>
          <Link href={`/artifacts/${id}`}>← Back</Link>
        </div>
      </main>
    );

  if (!doc)
    return (
      <main className="page">
        <div className="container">
          <div className="skeleton" style={{ height: 420 }}>loading</div>
        </div>
      </main>
    );

  const previewHtml = fullMode
    ? fullSource
    : joinPages({ ...doc, pages: [doc.pages[pageIdx]] });

  return (
    <main className="page">
      <div className="container stack" style={{ maxWidth: 1400 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>Edit — {meta?.artifact.title || "…"}</h1>
            <p className="muted small" style={{ margin: 0 }}>
              Saving creates a new immutable version. Pages are the top-level{" "}
              <span className="mono">&lt;section&gt;</span> blocks of the deck.
            </p>
          </div>
          <div className="row">
            <button
              className="btn btn-secondary btn-sm"
              onClick={fullMode ? exitFullMode : enterFullMode}
            >
              {fullMode ? "Back to page editor" : "Edit full source"}
            </button>
            <Link href={`/artifacts/${id}`} className="btn btn-secondary btn-sm">
              Cancel
            </Link>
          </div>
        </div>

        {lockConflict && (
          <div className="alert alert-warn row" style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{lockConflict.holder_name}</strong> ({lockConflict.holder_email}) is
              currently editing{lockConflict.stale ? " (connection looks stale)" : ""}. You
              can wait, or take over the editing lock.
            </span>
            <button
              className="btn btn-secondary btn-sm"
              onClick={async () => {
                const ok = await acquireLock(true);
                if (ok && !heartbeatRef.current) {
                  heartbeatRef.current = setInterval(() => acquireLock(false), 30_000);
                }
              }}
            >
              Take over
            </button>
          </div>
        )}
        {error && <div className="alert alert-error">{error}</div>}

        {fullMode ? (
          <div className="card stack">
            {!doc.supported && (
              <p className="muted small" style={{ margin: 0 }}>
                Tip: wrap each page in a top-level{" "}
                <span className="mono">&lt;section&gt;</span> inside{" "}
                <span className="mono">&lt;body&gt;</span> to unlock page-wise editing.
              </p>
            )}
            <textarea
              className="code"
              value={fullSource}
              onChange={(e) => setFullSource(e.target.value)}
              spellCheck={false}
              style={{ minHeight: 480 }}
            />
          </div>
        ) : (
          <div className="editor-layout">
            <div className="page-list">
              {doc.pages.map((p, i) => (
                <div
                  key={i}
                  className={`page-tab ${i === pageIdx ? "active" : ""}`}
                  onClick={() => setPageIdx(i)}
                  role="button"
                  tabIndex={0}
                >
                  <span>Page {i + 1}</span>
                  <span className="page-ops" onClick={(e) => e.stopPropagation()}>
                    <button title="Move up" onClick={() => movePage(i, -1)} disabled={i === 0}>↑</button>
                    <button title="Move down" onClick={() => movePage(i, 1)} disabled={i === doc.pages.length - 1}>↓</button>
                    <button
                      title="Delete page"
                      onClick={() => deletePage(i)}
                      disabled={doc.pages.length <= 1}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" onClick={addPage}>
                + Add page
              </button>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginBottom: 8 }}>Page {pageIdx + 1} source</h3>
              <textarea
                className="code"
                value={doc.pages[pageIdx]}
                onChange={(e) => setPageHtml(e.target.value)}
                spellCheck={false}
                style={{ minHeight: 440 }}
              />
            </div>

            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginBottom: 8 }}>Live preview — page {pageIdx + 1}</h3>
              <iframe
                className="preview-frame"
                sandbox="allow-scripts"
                srcDoc={withPreviewCsp(previewHtml)}
                title="preview"
              />
            </div>
          </div>
        )}

        <div className="card row">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Version note (e.g. “updated Q3 figures on page 2”)"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" onClick={save} disabled={busy || !currentHtml().trim()}>
            {busy ? "Saving…" : "Save as new version"}
          </button>
        </div>
      </div>
    </main>
  );
}
