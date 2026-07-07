"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [mode, setMode] = useState("create");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.target);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        orgName: form.get("orgName"),
        joinCode: form.get("joinCode"),
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError((await res.json()).error || "registration failed");
    }
  }

  return (
    <main className="page">
      <div className="container-narrow">
        <div className="card">
          <h1>Get started</h1>
          <div className="row" style={{ margin: "12px 0 18px" }}>
            <button
              type="button"
              className={`btn btn-sm ${mode === "create" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("create")}
            >
              Create an organization
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === "join" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMode("join")}
            >
              Join with a code
            </button>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={submit}>
            {mode === "create" ? (
              <label className="field">
                <span>Organization name</span>
                <input name="orgName" type="text" placeholder="Acme Corp" required />
              </label>
            ) : (
              <label className="field">
                <span>Organization join code</span>
                <input name="joinCode" type="text" placeholder="from a teammate's dashboard" required />
              </label>
            )}
            <label className="field">
              <span>Your name</span>
              <input name="name" type="text" required />
            </label>
            <label className="field">
              <span>Work email</span>
              <input name="email" type="email" required />
            </label>
            <label className="field">
              <span>Password (min 8 characters)</span>
              <input name="password" type="password" minLength={8} required />
            </label>
            <button className="btn btn-primary" disabled={busy} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "Creating…" : mode === "create" ? "Create workspace" : "Join organization"}
            </button>
          </form>
          <p className="small muted" style={{ marginTop: 14 }}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
