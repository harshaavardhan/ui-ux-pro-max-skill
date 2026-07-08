"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MsLogo } from "@/app/components/ms-logo.js";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [method, setMethod] = useState("password");
  const [error, setError] = useState(
    params.get("error") === "sso" ? "Microsoft sign-in failed — please try again." : ""
  );
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMsg("");
    const form = new FormData(e.target);
    if (method === "magic") {
      const res = await fetch("/api/auth/magic/request-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      const d = await res.json();
      setBusy(false);
      if (res.ok) setMsg(d.message);
      else setError(d.error || "request failed");
      return;
    }
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
          <h1>
            Sign back <span className="grad">in.</span>
          </h1>
          <p className="muted small">Your workspace is where you left it.</p>

          <a href="/api/auth/outlook/start" className="btn btn-ms">
            <MsLogo /> Continue with Microsoft
          </a>

          <div className="divider">or use your email</div>

          {error && <div className="alert alert-error">{error}</div>}
          {msg && (
            <div className="alert alert-ok">
              {msg} <Link href="/outbox">Open dev outbox →</Link>
            </div>
          )}

          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required autoFocus />
            </label>
            {method === "password" && (
              <label className="field">
                <span>Password</span>
                <input name="password" type="password" required />
              </label>
            )}
            <button
              className="btn btn-primary"
              disabled={busy}
              style={{ width: "100%" }}
            >
              {busy
                ? "Signing in…"
                : method === "password"
                  ? "Sign in"
                  : "Email me a sign-in link"}
            </button>
          </form>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ width: "100%", marginTop: 10 }}
            onClick={() => {
              setMethod(method === "password" ? "magic" : "password");
              setMsg("");
              setError("");
            }}
          >
            {method === "password"
              ? "Prefer no password? Email me a sign-in link"
              : "Use password instead"}
          </button>

          <p className="small muted" style={{ marginTop: 16 }}>
            No account? <Link href="/register">Create a workspace</Link>. Received a
            share link by email? Just open it — no account needed.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
