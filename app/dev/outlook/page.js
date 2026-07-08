"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MsLogo } from "@/app/components/ms-logo.js";

// Development simulator for Microsoft sign-in. Only functional when no
// real Azure app registration (MS_CLIENT_ID/MS_CLIENT_SECRET) is configured
// — the backing endpoint returns 404 otherwise.
export default function DevOutlook() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.target);
    const res = await fetch("/api/auth/outlook/dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), name: form.get("name") }),
    });
    const d = await res.json();
    setBusy(false);
    if (res.ok) {
      router.push(d.redirect);
      router.refresh();
    } else {
      setError(d.error || "failed");
    }
  }

  return (
    <main className="page">
      <div className="container-narrow">
        <div className="card">
          <div className="alert alert-warn">
            <strong>Development simulator.</strong> No Azure app registration is
            configured (<span className="mono">MS_CLIENT_ID</span>), so this page
            stands in for Microsoft's sign-in screen. In production you are
            redirected to login.microsoftonline.com instead.
          </div>
          <h1 className="row" style={{ gap: 10 }}>
            <MsLogo /> Sign in with Microsoft
          </h1>
          <p className="muted small">
            Enter the identity the simulated Microsoft account should return.
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <label className="field">
              <span>Microsoft account email</span>
              <input name="email" type="email" placeholder="you@company.com" required autoFocus />
            </label>
            <label className="field">
              <span>Display name</span>
              <input name="name" type="text" placeholder="Your Name" />
            </label>
            <button className="btn btn-primary" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Signing in…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
