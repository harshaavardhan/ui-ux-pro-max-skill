"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.target);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError((await res.json()).error || "sign-in failed");
    }
  }

  return (
    <main className="page">
      <div className="container-narrow">
        <div className="card">
          <h1>Sign in</h1>
          <p className="muted small">Org members sign in with email and password.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required autoFocus />
            </label>
            <label className="field">
              <span>Password</span>
              <input name="password" type="password" required />
            </label>
            <button className="btn btn-primary" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="small muted" style={{ marginTop: 14 }}>
            No account? <Link href="/register">Create a workspace</Link>. Received a
            share link by email? Just open it — no account needed.
          </p>
        </div>
      </div>
    </main>
  );
}
