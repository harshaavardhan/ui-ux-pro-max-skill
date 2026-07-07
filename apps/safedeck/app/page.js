import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth.js";

export default function Home() {
  if (currentUser()) redirect("/dashboard");
  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 780, textAlign: "center", paddingTop: 60 }}>
        <div
          className="badge badge-info"
          style={{ marginBottom: 18, fontSize: "0.78rem" }}
        >
          The enterprise replacement for emailing decks
        </div>
        <h1 style={{ fontSize: "2.4rem", marginBottom: 14 }}>
          Share interactive HTML artifacts.
          <br />
          Safely. Between companies.
        </h1>
        <p className="muted" style={{ fontSize: "1.05rem", maxWidth: 620, margin: "0 auto 28px" }}>
          SafeDeck replaces PowerPoint attachments with tamper-evident,
          sandboxed HTML decks. Recipient-bound links, per-person roles,
          SHA-256 integrity on every view, full audit trail — and zero data
          leakage by construction.
        </p>
        <div className="row" style={{ justifyContent: "center", gap: 12 }}>
          <Link href="/register" className="btn btn-primary">
            Create your workspace
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Sign in
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 16,
            marginTop: 56,
            textAlign: "left",
          }}
        >
          {[
            ["Tamper-evident", "Every version is immutable and SHA-256 fingerprinted. Content is re-verified on every single view."],
            ["Sandboxed viewing", "Artifacts run in an isolated iframe with a no-network CSP — interactive, but they can't phone home."],
            ["Recipient-bound links", "Share links verified by email. A forwarded link is useless to anyone not invited."],
            ["Full audit trail", "Every view, edit, share, and revocation is logged and visible to the owner."],
          ].map(([title, body]) => (
            <div key={title} className="card" style={{ padding: 18 }}>
              <h3 style={{ marginBottom: 6 }}>{title}</h3>
              <p className="muted small" style={{ margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
