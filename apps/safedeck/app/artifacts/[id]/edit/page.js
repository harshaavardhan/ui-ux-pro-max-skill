"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

export default function EditPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const [meta, setMeta] = useState(null);
  const [html, setHtml] = useState("");
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
        // Load latest version source via render endpoint (same-origin fetch).
        const res = await fetch(`/api/render/${d.artifact.current_version_id}`);
        const text = await res.text();
        if (!cancelled) setHtml(text);
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
      // Best-effort release
      fetch(`/api/artifacts/${id}/lock`, { method: "DELETE" }).catch(() => {});
    };
  }, [id, acquireLock]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const d = await api(`/api/artifacts/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({ html, note }),
      });
      router.push(`/artifacts/${id}`);
      router.refresh();
      return d;
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

  return (
    <main className="page">
      <div className="container stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h1 style={{ marginBottom: 2 }}>
              Edit — {meta?.artifact.title || "…"}
            </h1>
            <p className="muted small" style={{ margin: 0 }}>
              Saving creates a new immutable version; previous versions remain
              intact and verifiable.
            </p>
          </div>
          <Link href={`/artifacts/${id}`} className="btn btn-secondary btn-sm">
            Cancel
          </Link>
        </div>

        {lockConflict && (
          <div className="alert alert-warn row" style={{ justifyContent: "space-between" }}>
            <span>
              <strong>{lockConflict.holder_name}</strong> ({lockConflict.holder_email}) is
              currently editing{lockConflict.stale ? " (connection looks stale)" : ""}.
              You can wait, or take over the editing lock.
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

        <div className="card stack">
          <textarea
            className="code"
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            spellCheck={false}
          />
          <div className="row">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Version note (e.g. “updated Q3 figures”)"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={save} disabled={busy || !html.trim()}>
              {busy ? "Saving…" : "Save as new version"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
