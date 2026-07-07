"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MsLogo } from "@/app/components/ms-logo.js";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const isSso = params.get("sso") === "1";
  const [mode, setMode] = useState("create");
  const [ssoIdentity, setSsoIdentity] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSso) return;
    fetch("/api/auth/sso-pending")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSsoIdentity)
      .catch(() =>
        setError("Your Microsoft sign-in expired — please start again from the sign-in page.")
      );
  }, [isSso]);

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
        sso: isSso,
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
        <div className="card card-glass">
          <h1>{isSso ? "Almost there" : "Get started"}</h1>
          {isSso && ssoIdentity && (
            <div className="alert alert-ok row" style={{ gap: 8 }}>
              <MsLogo /> Signed in with Microsoft as{" "}
              <strong>{ssoIdentity.email}</strong> — just pick your organization.
            </div>
          )}
          {!isSso && (
            <>
              <a href="/api/auth/outlook/start" className="btn btn-ms" style={{ marginTop: 6 }}>
                <MsLogo /> Continue with Microsoft
              </a>
              <div className="divider">or sign up with email</div>
            </>
          )}
          <div className="row" style={{ margin: "4px 0 18px" }}>
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
              <input
                name="name"
                type="text"
                defaultValue={ssoIdentity?.name || ""}
                key={ssoIdentity?.name || "blank"}
                required
              />
            </label>
            {!isSso && (
              <>
                <label className="field">
                  <span>Work email</span>
                  <input name="email" type="email" required />
                </label>
                <label className="field">
                  <span>Password (min 8 characters)</span>
                  <input name="password" type="password" minLength={8} required />
                </label>
              </>
            )}
            <button className="btn btn-primary" disabled={busy || (isSso && !ssoIdentity)} style={{ width: "100%" }}>
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

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
