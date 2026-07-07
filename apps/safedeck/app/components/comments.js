"use client";

import { useCallback, useEffect, useState } from "react";

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

export function Comments({ id, canComment, version, linkToken, guestPrompt }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [guestName, setGuestName] = useState("");
  const [err, setErr] = useState("");
  const qs = linkToken ? `?link=${encodeURIComponent(linkToken)}` : "";

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/artifacts/${id}/comments${qs}`);
      setComments(d.comments);
    } catch (e) {
      setErr(e.message);
    }
  }, [id, qs]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(e) {
    e.preventDefault();
    setErr("");
    try {
      await api(`/api/artifacts/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body,
          versionNumber: version,
          link: linkToken,
          guestName,
        }),
      });
      setBody("");
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div>
      {err && <div className="alert alert-error">{err}</div>}
      {comments.length === 0 && <p className="muted small">No comments yet.</p>}
      {comments.map((c) => (
        <div className="comment" key={c.id}>
          <div className="meta">
            <strong>{c.author_name || c.author_email}</strong>
            {c.version_number ? ` · on v${c.version_number}` : ""} · {c.created_at}
          </div>
          <div className="body">{c.body}</div>
        </div>
      ))}
      {canComment && (
        <form onSubmit={post} style={{ marginTop: 12 }}>
          {guestPrompt && (
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Your name"
              style={{ marginBottom: 8 }}
              required
            />
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            style={{ minHeight: 70 }}
            required
          />
          <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>
            Comment
          </button>
        </form>
      )}
    </div>
  );
}
