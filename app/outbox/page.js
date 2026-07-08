import db from "@/lib/db.js";

export const dynamic = "force-dynamic";

// Development-only email outbox. In production, wire SMTP in lib/mail.js
// and remove or protect this page.
export default function Outbox() {
  const mails = db
    .prepare("SELECT * FROM outbox ORDER BY id DESC LIMIT 50")
    .all();

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 860 }}>
        <h1>Dev outbox</h1>
        <p className="muted small">
          Emails the system would send in production land here during
          development. Newest first.
        </p>
        <div className="stack">
          {mails.length === 0 && (
            <div className="card muted">No emails yet.</div>
          )}
          {mails.map((m) => (
            <div className="card" key={m.id}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{m.subject}</strong>
                <span className="muted small">{m.created_at}</span>
              </div>
              <div className="muted small">To: {m.to_email}</div>
              <pre
                className="small"
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#f8fafc", padding: 12, borderRadius: 8 }}
              >
                {m.body}
              </pre>
              {m.link && (
                <a href={m.link} className="btn btn-primary btn-sm">
                  Open link →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
