"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE = `<!doctype html>
<html>
<head>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #f8fafc; }
  section.page { min-height: 100vh; display: grid; place-items: center; padding: 48px;
                 border-bottom: 1px dashed #334155; }
  .inner { max-width: 640px; text-align: center; }
  h1 { font-size: 2.2rem; background: linear-gradient(90deg,#818cf8,#c084fc);
       -webkit-background-clip: text; background-clip: text; color: transparent; }
  button { margin-top: 24px; padding: 10px 22px; border-radius: 999px; border: none;
           background: #4f46e5; color: #fff; font-weight: 600; cursor: pointer; }
</style>
</head>
<body>
  <section class="page">
    <div class="inner">
      <h1>Q3 Business Review</h1>
      <p>An interactive deck. Each top-level &lt;section&gt; is a page — editable one at a time in SafeDeck.</p>
      <button onclick="this.textContent = 'Clicked at ' + new Date().toLocaleTimeString()">Try me</button>
    </div>
  </section>
  <section class="page">
    <div class="inner">
      <h1>Revenue</h1>
      <p>Up and to the right. Scripts run, but this deck cannot reach the network.</p>
    </div>
  </section>
  <section class="page">
    <div class="inner">
      <h1>Next steps</h1>
      <p>Share this deck with a recipient-bound link — forwarding it leaks nothing.</p>
    </div>
  </section>
</body>
</html>`;

export default function NewArtifact() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.target);
    const res = await fetch("/api/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.get("title"), html }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) {
      router.push(`/artifacts/${data.id}`);
      router.refresh();
    } else {
      setError(data.error || "failed to create artifact");
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setHtml(String(reader.result || ""));
    reader.readAsText(file);
  }

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 860 }}>
        <div className="card">
          <h1>New artifact</h1>
          <p className="muted small">
            Paste or upload the HTML deck. It will be stored immutably as
            version 1 with a SHA-256 fingerprint.
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit} className="stack">
            <label className="field" style={{ margin: 0 }}>
              <span>Title</span>
              <input name="title" type="text" placeholder="Q3 Business Review" required />
            </label>
            <label className="field" style={{ margin: 0 }}>
              <span>HTML source (max 2 MB)</span>
              <textarea
                className="code"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="<!doctype html>…"
                required
              />
            </label>
            <div className="row">
              <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                Upload .html file
                <input type="file" accept=".html,.htm,text/html" onChange={onFile} style={{ display: "none" }} />
              </label>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setHtml(SAMPLE)}
              >
                Use sample deck
              </button>
              <span className="spacer" style={{ flex: 1 }} />
              <button className="btn btn-primary" disabled={busy || !html}>
                {busy ? "Creating…" : "Create artifact"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
