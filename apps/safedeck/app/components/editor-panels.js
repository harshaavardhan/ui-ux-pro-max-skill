"use client";

import { useEffect, useRef, useState } from "react";

// ---- Inspector: style controls for the selected element ----
export function Inspector({ info, onStyle, onDelete, onDuplicate, onMove, onImage }) {
  if (!info) {
    return (
      <div className="insp-empty">
        <div className="insp-empty-icon">☝︎</div>
        <p className="muted small">
          Click any element on the page to style it. Double-click text to edit it
          inline.
        </p>
      </div>
    );
  }
  const s = info.styles;
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="badge badge-info">{info.tag}</span>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" title="Move up" onClick={() => onMove(-1)}>↑</button>
          <button className="icon-btn" title="Move down" onClick={() => onMove(1)}>↓</button>
          <button className="icon-btn" title="Duplicate" onClick={onDuplicate}>⧉</button>
          <button className="icon-btn danger" title="Delete" onClick={onDelete}>🗑</button>
        </div>
      </div>

      {info.isText && (
        <>
          <Field label="Text color">
            <ColorInput value={s.color} onChange={(v) => onStyle("color", v)} />
          </Field>
          <Field label={`Font size — ${Math.round(s.fontSize)}px`}>
            <input
              type="range" min="10" max="96" value={Math.round(s.fontSize)}
              onChange={(e) => onStyle("fontSize", e.target.value + "px")}
            />
          </Field>
          <div className="row" style={{ gap: 6 }}>
            <SegBtn active={s.fontWeight >= 600 || s.fontWeight === "bold"} onClick={() => onStyle("fontWeight", (s.fontWeight >= 600 || s.fontWeight === "bold") ? "400" : "700")}>B</SegBtn>
            <SegBtn active={s.fontStyle === "italic"} onClick={() => onStyle("fontStyle", s.fontStyle === "italic" ? "normal" : "italic")} italic>I</SegBtn>
            <span style={{ width: 8 }} />
            {["left", "center", "right"].map((a) => (
              <SegBtn key={a} active={s.textAlign === a} onClick={() => onStyle("textAlign", a)}>
                {a === "left" ? "⤴" : a === "center" ? "≡" : "⤵"}
              </SegBtn>
            ))}
          </div>
        </>
      )}

      <Field label="Background">
        <ColorInput value={s.backgroundColor} onChange={(v) => onStyle("backgroundColor", v)} />
      </Field>
      <Field label={`Corner radius — ${Math.round(s.borderRadius)}px`}>
        <input type="range" min="0" max="48" value={Math.round(s.borderRadius)}
          onChange={(e) => onStyle("borderRadius", e.target.value + "px")} />
      </Field>
      <Field label={`Padding — ${Math.round(s.padding)}px`}>
        <input type="range" min="0" max="80" value={Math.round(s.padding)}
          onChange={(e) => onStyle("padding", e.target.value + "px")} />
      </Field>

      {info.isImage && (
        <Field label="Replace image">
          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
            Upload image…
            <input type="file" accept="image/*" style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 2 * 1024 * 1024) { alert("Image must be under 2 MB (embedded as data URI)."); return; }
                const r = new FileReader();
                r.onload = () => onImage(String(r.result));
                r.readAsDataURL(f);
              }} />
          </label>
        </Field>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="insp-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function SegBtn({ active, onClick, children, italic }) {
  return (
    <button
      onClick={onClick}
      className={`seg-btn ${active ? "active" : ""}`}
      style={{ fontStyle: italic ? "italic" : "normal", fontWeight: 700 }}
    >
      {children}
    </button>
  );
}
function ColorInput({ value, onChange }) {
  // Normalize rgb() to hex for the native picker.
  const hex = rgbToHex(value);
  return (
    <div className="row" style={{ gap: 8 }}>
      <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} className="color-swatch" />
      <span className="mono small muted">{hex}</span>
    </div>
  );
}
function rgbToHex(c) {
  if (!c) return "#000000";
  if (c[0] === "#") return c;
  const m = c.match(/\d+/g);
  if (!m || m.length < 3) return "#000000";
  return "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("");
}

// ---- AI chat assistant ----
export function AiAssistant({ artifactId, pageIndex, getPageHtml, onResult, credits }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    setApiKey(localStorage.getItem("sd_anthropic_key") || "");
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, busy]);

  function saveKey(v) {
    setApiKey(v);
    if (v) localStorage.setItem("sd_anthropic_key", v);
    else localStorage.removeItem("sd_anthropic_key");
  }

  async function send(e) {
    e.preventDefault();
    const instruction = input.trim();
    if (!instruction || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: instruction }]);
    setBusy(true);
    try {
      const res = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactId,
          html: getPageHtml(),
          instruction,
          apiKey: apiKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsgs((m) => [...m, { role: "error", text: data.error || "request failed" }]);
      } else {
        onResult(data.html);
        setMsgs((m) => [
          ...m,
          { role: "assistant", text: data.summary, credits: data.creditsRemaining },
        ]);
      }
    } catch (err) {
      setMsgs((m) => [...m, { role: "error", text: err.message }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-panel">
      <div className="ai-scroll" ref={scrollRef}>
        {msgs.length === 0 && (
          <div className="muted small" style={{ padding: "8px 2px" }}>
            <p style={{ marginTop: 0 }}>
              Describe a change to <strong>page {pageIndex + 1}</strong> in plain
              English and the assistant edits it for you.
            </p>
            <div className="ai-suggest">
              {["Make the headline bigger and bolder", "Change the background to a dark gradient", "Add a call-to-action button", "Tighten the spacing and left-align everything"].map((s) => (
                <button key={s} className="chip" onClick={() => setInput(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`ai-msg ai-${m.role}`}>
            {m.text}
            {m.credits != null && (
              <div className="muted" style={{ fontSize: "0.68rem", marginTop: 3 }}>
                {m.credits} platform credits left
              </div>
            )}
          </div>
        ))}
        {busy && <div className="ai-msg ai-assistant"><span className="dots">Editing…</span></div>}
      </div>

      <form onSubmit={send} className="ai-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { send(e); } }}
          placeholder="Ask the assistant to change this page…"
          rows={2}
        />
        <button className="btn btn-primary btn-sm" disabled={busy || !input.trim()}>Send</button>
      </form>

      <button className="ai-key-toggle" onClick={() => setShowKey((s) => !s)}>
        {apiKey ? "🔑 Using your API key" : credits != null ? `⚡ ${credits} platform credits` : "🔑 Set API key"} · {showKey ? "hide" : "manage"}
      </button>
      {showKey && (
        <div className="ai-key-box">
          <p className="muted" style={{ fontSize: "0.72rem", margin: "0 0 6px" }}>
            Paste your Anthropic API key to use your own credits. It's stored only
            in this browser (localStorage) and sent directly with each edit
            request — SafeDeck never persists it.
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => saveKey(e.target.value)}
            placeholder="sk-ant-…"
            className="mono"
            style={{ fontSize: "0.75rem" }}
          />
        </div>
      )}
    </div>
  );
}
