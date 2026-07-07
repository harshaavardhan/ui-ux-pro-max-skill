import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth.js";

export default function Home() {
  if (currentUser()) redirect("/dashboard");
  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 820, textAlign: "center", paddingTop: 64 }}>
        <div className="hero-badge">
          ✨ The friendly way to retire the PowerPoint attachment
        </div>
        <h1 className="hero-title">
          Share interactive decks.
          <br />
          <span className="grad">Safely, between companies.</span>
        </h1>
        <p className="muted" style={{ fontSize: "1.05rem", maxWidth: 620, margin: "0 auto 28px" }}>
          SafeDeck turns HTML artifacts into tamper-evident, sandboxed decks
          you can share by email. Recipient-bound links, page-wise editing,
          per-person roles, SHA-256 integrity on every view — and zero data
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
            ["🔏", "Tamper-evident", "Every version is immutable and SHA-256 fingerprinted. Content is re-verified on every single view."],
            ["🛡️", "Sandboxed viewing", "Artifacts run in an isolated iframe with a no-network CSP — interactive, but they can't phone home."],
            ["✉️", "Recipient-bound links", "Share links verified by email. A forwarded link is useless to anyone not invited."],
            ["📑", "Page-wise editing", "Edit a deck one page at a time with live preview — every save is a new verifiable version."],
            ["🪪", "Sign in your way", "Microsoft (Outlook) single sign-on, password, or an emailed magic link — external viewers need no account."],
            ["🧾", "Full audit trail", "Every view, edit, share, and revocation is logged and visible to the owner."],
          ].map(([icon, title, body]) => (
            <div key={title} className="card card-glass" style={{ padding: 18 }}>
              <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>{icon}</div>
              <h3 style={{ marginBottom: 6 }}>{title}</h3>
              <p className="muted small" style={{ margin: 0 }}>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
