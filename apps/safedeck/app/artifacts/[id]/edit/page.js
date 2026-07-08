"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { splitPages, joinPages, blankPage } from "@/lib/pages.js";
import { buildEditableDoc } from "@/lib/editor-runtime.js";
import { Inspector, AiAssistant } from "@/app/components/editor-panels.js";
import { WindowBar } from "@/app/components/window-bar.js";

async function api(path, opts) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export default function EditPage({ params }) {
  const { id } = params;
  const router = useRouter();

  const [meta, setMeta] = useState(null);
  const [doc, setDoc] = useState(null); // { supported, prefix, pages[], suffix }
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [lockConflict, setLockConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("design"); // design | assistant | source
  const [dirty, setDirty] = useState(false);
  const [credits, setCredits] = useState(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceText, setSourceText] = useState("");
  const [canvasEpoch, setCanvasEpoch] = useState(0); // bump to force canvas reload
  const [histVer, setHistVer] = useState(0); // re-render undo/redo buttons

  const iframeRef = useRef(null);
  const heartbeatRef = useRef(null);
  const docRef = useRef(null);
  const pageIdxRef = useRef(0);
  const histRef = useRef({ stack: [], idx: -1 }); // undo/redo snapshots
  const restoringRef = useRef(false);
  docRef.current = doc;
  pageIdxRef.current = pageIdx;

  // ---- undo / redo history (snapshots of pages + source) ----
  useEffect(() => {
    if (!doc) return;
    if (restoringRef.current) { restoringRef.current = false; return; }
    const snap = JSON.stringify({ p: doc.pages, s: sourceText });
    const h = histRef.current;
    if (h.stack[h.idx] === snap) return;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(snap);
    if (h.stack.length > 100) h.stack.shift(); // cap
    h.idx = h.stack.length - 1;
    setHistVer((v) => v + 1);
  }, [doc, sourceText]);

  function restore(snap) {
    const parsed = JSON.parse(snap);
    restoringRef.current = true;
    setDoc((d) => ({ ...d, pages: parsed.p }));
    setSourceText(parsed.s);
    setSelected(null);
    setDirty(true);
    setCanvasEpoch((e) => e + 1);
  }
  function undo() {
    const h = histRef.current;
    if (h.idx <= 0) return;
    h.idx -= 1;
    setHistVer((v) => v + 1);
    restore(h.stack[h.idx]);
  }
  function redo() {
    const h = histRef.current;
    if (h.idx >= h.stack.length - 1) return;
    h.idx += 1;
    setHistVer((v) => v + 1);
    restore(h.stack[h.idx]);
  }
  const canUndo = histVer >= 0 && histRef.current.idx > 0;
  const canRedo = histRef.current.idx < histRef.current.stack.length - 1;

  // ---- keyboard shortcuts (⌘Z / ⌘⇧Z / ⌘S) ----
  const actionsRef = useRef({});
  useEffect(() => {
    function onKey(e) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); actionsRef.current.undo?.(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); actionsRef.current.redo?.(); }
      else if (k === "s") { e.preventDefault(); actionsRef.current.save?.(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- lock ----
  const acquireLock = useCallback(async (takeover = false) => {
    try {
      const res = await fetch(`/api/artifacts/${id}/lock`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeover }),
      });
      const data = await res.json();
      if (res.status === 409) { setLockConflict(data.lock); return false; }
      setLockConflict(null);
      return true;
    } catch { return false; }
  }, [id]);

  // ---- initial load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api(`/api/artifacts/${id}`);
        if (cancelled) return;
        if (!d.access.canEdit) { setError("You need editor access to edit this artifact."); return; }
        setMeta(d);
        const res = await fetch(`/api/render/${d.artifact.current_version_id}`);
        const text = await res.text();
        if (cancelled) return;
        const split = splitPages(text);
        setDoc(split);
        if (!split.supported) { setSourceMode(true); setSourceText(text); }
        const ok = await acquireLock(false);
        if (ok) heartbeatRef.current = setInterval(() => acquireLock(false), 30000);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      fetch(`/api/artifacts/${id}/lock`, { method: "DELETE" }).catch(() => {});
    };
  }, [id, acquireLock]);

  useEffect(() => {
    api("/api/ai/credits").then((d) => setCredits(d.credits)).catch(() => {});
  }, []);

  // ---- iframe message bridge ----
  useEffect(() => {
    function onMsg(e) {
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      const msg = e.data || {};
      if (msg.type === "sd-select") setSelected(msg.info);
      else if (msg.type === "sd-deselect") setSelected(null);
      else if (msg.type === "sd-changed") applyPageHtml(msg.page);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Reconstruct the current page's HTML from the iframe's cleaned serialization.
  function applyPageHtml(page) {
    const d = docRef.current;
    if (!d) return;
    const i = pageIdxRef.current;
    let newPageSource;
    if (page.kind === "section") {
      newPageSource = page.html;
    } else {
      // Unstructured doc: body innerHTML replaced whole-document.
      newPageSource = page.html;
    }
    setDoc((prev) => {
      const pages = prev.pages.slice();
      // Preserve inter-page whitespace by keeping any trailing text after the tag.
      pages[i] = newPageSource;
      return { ...prev, pages };
    });
    setDirty(true);
  }

  function currentPageDoc(editable) {
    const d = docRef.current || doc;
    if (!d) return "";
    if (!d.supported) return buildEditableDoc(sourceText || joinPages(d), { editable });
    const single = { ...d, pages: [d.pages[pageIdx]] };
    return buildEditableDoc(joinPages(single), { editable });
  }

  function iframeSend(msg) {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }

  // ---- page ops ----
  function selectPage(i) {
    setSelected(null);
    setPageIdx(i);
  }
  function addPage() {
    setDoc((d) => {
      const pages = d.pages.slice();
      pages.splice(pageIdx + 1, 0, blankPage(pages.length + 1));
      return { ...d, pages };
    });
    setPageIdx((i) => i + 1);
    setDirty(true);
  }
  function deletePage(i) {
    setDoc((d) => {
      if (d.pages.length <= 1) return d;
      const pages = d.pages.slice(); pages.splice(i, 1);
      return { ...d, pages };
    });
    setPageIdx((cur) => Math.max(0, cur >= i ? cur - 1 : cur));
    setDirty(true);
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
    setDirty(true);
  }

  // ---- source mode <-> visual ----
  function enterSource() {
    const d = docRef.current;
    setSourceText(d.supported ? joinPages(d) : (sourceText || joinPages(d)));
    setSourceMode(true);
  }
  function exitSource() {
    const split = splitPages(sourceText);
    setDoc(split);
    setPageIdx(0);
    setSelected(null);
    if (split.supported) setSourceMode(false);
    else setError("No top-level <section> pages found — staying in source mode.");
    setDirty(true);
  }

  function currentHtml() {
    const d = docRef.current;
    if (sourceMode || !d.supported) return sourceText || joinPages(d);
    return joinPages(d);
  }

  async function save() {
    setBusy(true); setError("");
    try {
      await api(`/api/artifacts/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({ html: currentHtml(), note }),
      });
      router.push(`/artifacts/${id}`);
      router.refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (error && !meta)
    return (
      <main className="page"><div className="container">
        <div className="alert alert-error">{error}</div>
        <Link href={`/artifacts/${id}`}>← Back</Link>
      </div></main>
    );
  if (!doc)
    return <main className="page"><div className="container"><div className="skeleton" style={{ height: 480 }}>loading</div></div></main>;

  const pages = doc.pages;
  actionsRef.current = { undo, redo, save };

  return (
    <div className="studio">
      {/* Top bar */}
      <div className="studio-top">
        <div className="row" style={{ gap: 10 }}>
          <Link href={`/artifacts/${id}`} className="btn btn-secondary btn-sm">← Exit</Link>
          <strong style={{ fontFamily: "var(--font-heading)" }}>{meta.artifact.title}</strong>
          {dirty && <span className="badge badge-warn">unsaved</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="undo-group">
            <button className="undo-btn" onClick={undo} disabled={!canUndo} title="Undo (⌘Z)">↶</button>
            <button className="undo-btn" onClick={redo} disabled={!canRedo} title="Redo (⌘⇧Z)">↷</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={sourceMode ? exitSource : enterSource}>
            {sourceMode ? "Visual editor" : "Edit source"}
          </button>
          <input
            type="text" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Version note…" className="note-input"
          />
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy} title="Save (⌘S)">
            {busy ? "Saving…" : "Save version"}
          </button>
        </div>
      </div>

      {lockConflict && (
        <div className="alert alert-warn row" style={{ justifyContent: "space-between", margin: "0 16px" }}>
          <span><strong>{lockConflict.holder_name}</strong> is editing{lockConflict.stale ? " (stale)" : ""}. Take over?</span>
          <button className="btn btn-secondary btn-sm" onClick={async () => {
            const ok = await acquireLock(true);
            if (ok && !heartbeatRef.current) heartbeatRef.current = setInterval(() => acquireLock(false), 30000);
          }}>Take over</button>
        </div>
      )}
      {error && <div className="alert alert-error" style={{ margin: "8px 16px 0" }}>{error}</div>}

      <div className="studio-body">
        {/* Page rail */}
        {!sourceMode && doc.supported && (
          <aside className="studio-rail">
            {pages.map((_, i) => (
              <div key={i} className={`rail-item ${i === pageIdx ? "active" : ""}`} onClick={() => selectPage(i)}>
                <div className="rail-thumb">
                  <iframe
                    tabIndex={-1}
                    sandbox="allow-scripts"
                    srcDoc={buildEditableDoc(joinPages({ ...doc, pages: [pages[i]] }), { editable: false })}
                    title={`page ${i + 1}`}
                  />
                  <div className="rail-thumb-block" />
                </div>
                <div className="rail-meta">
                  <span>Page {i + 1}</span>
                  <span className="rail-ops" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => movePage(i, -1)} disabled={i === 0} title="Up">↑</button>
                    <button onClick={() => movePage(i, 1)} disabled={i === pages.length - 1} title="Down">↓</button>
                    <button onClick={() => deletePage(i)} disabled={pages.length <= 1} title="Delete">✕</button>
                  </span>
                </div>
              </div>
            ))}
            <button className="rail-add" onClick={addPage}>+ Add page</button>
          </aside>
        )}

        {/* Canvas */}
        <div className="studio-canvas">
          {sourceMode ? (
            <div className="card" style={{ height: "100%" }}>
              {!doc.supported && (
                <p className="muted small" style={{ marginTop: 0 }}>
                  Wrap each page in a top-level <span className="mono">&lt;section&gt;</span> to unlock the visual editor.
                </p>
              )}
              <textarea className="code" value={sourceText} spellCheck={false}
                onChange={(e) => { setSourceText(e.target.value); setDirty(true); }}
                style={{ minHeight: "70vh", width: "100%" }} />
            </div>
          ) : (
            <>
              <div className="canvas-hint scribble-note">
                Click to select · double-click text to edit · ⌘Z to undo · ⌘S to save
              </div>
              <div className="canvas-frame-wrap">
                <div className="canvas-stage">
                  <WindowBar title={`Page ${pageIdx + 1} of ${doc.pages.length}`} />
                  <iframe
                    key={`${pageIdx}-${doc.pages.length}-${canvasEpoch}`}
                    ref={iframeRef}
                    className="canvas-frame"
                    sandbox="allow-scripts"
                    srcDoc={currentPageDoc(true)}
                    title="editor canvas"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right dock */}
        {!sourceMode && (
          <aside className="studio-dock">
            <div className="dock-tabs">
              {[["design", "Design"], ["assistant", "Assistant"]].map(([k, label]) => (
                <button key={k} className={`dock-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
            {tab === "design" ? (
              <div className="dock-body">
                <Inspector
                  info={selected}
                  onStyle={(prop, value) => iframeSend({ type: "sd-style", prop, value })}
                  onDelete={() => iframeSend({ type: "sd-delete" })}
                  onDuplicate={() => iframeSend({ type: "sd-duplicate" })}
                  onMove={(dir) => iframeSend({ type: "sd-move", dir })}
                  onImage={(dataUri) => iframeSend({ type: "sd-image", dataUri })}
                />
              </div>
            ) : (
              <div className="dock-body" style={{ padding: 0 }}>
                <AiAssistant
                  artifactId={id}
                  pageIndex={pageIdx}
                  credits={credits}
                  getPageHtml={() => (doc.supported ? doc.pages[pageIdx] : currentHtml())}
                  onResult={(html) => {
                    setDoc((d) => {
                      const p = d.pages.slice(); p[pageIdxRef.current] = html;
                      return { ...d, pages: p };
                    });
                    setSelected(null);
                    setDirty(true);
                    setCanvasEpoch((e) => e + 1); // AI replaced the page → reload canvas
                  }}
                />
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
