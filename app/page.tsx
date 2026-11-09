"use client";

import Link from "next/link";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CoBrand from "@/components/CoBrand";


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState<any>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [forgot, setForgot] = useState<{ busy?: boolean; sent?: boolean; noEmail?: boolean; err?: string }>({});
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("reset") === "1") setNotice("Password updated — sign in with your new one.");
    if (q.get("welcome") === "1") {
      setNotice("You're all set — sign in with the password you just chose.");
      if (q.get("email")) setEmail(q.get("email") || "");
    }
  }, []);

  async function sendReset() {
    const addr = email.trim();
    if (!addr) {
      setForgot({ err: "Type your email above first." });
      return;
    }
    setForgot({ busy: true });
    const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: addr }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setForgot({ err: d.error || "Could not send." });
    setForgot(d.emailConfigured === false ? { noEmail: true } : { sent: true });
  }

  useEffect(() => {
    fetch("/api/tenant").then((r) => (r.ok ? r.json() : null)).then(setTenant).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.authenticated) router.replace("/portal/vehicle");
      })
      .catch(() => {});
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) {
      setError("Enter your password to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.wga) {
          router.push("/wga");
          return;
        }
        setError(data.error || "Sign-in failed.");
        setBusy(false);
        return;
      }
      router.push(data.mustChangePassword ? "/portal/password?first=1" : "/portal/vehicle");
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="frame">
      <main>
        <div className="login-stage">
          <div style={{ marginBottom: 40 }}>
            <CoBrand size="login" logoUrl={tenant?.brand?.logo_url} brandName={tenant?.brand?.name} wga />
          </div>
          <h1 className="login-title">
            Dealership
            <br />
            Pricing Portal.
          </h1>
          <p className="login-sub">
            Vehicle-specific pricing for paint protection film, ceramic coating, window tint, and windshield protection — installed by White Glove Auto.
          </p>

          {notice ? <div className="notice" style={{ maxWidth: 420, margin: "0 auto 18px" }}>{notice}</div> : null}
          <form className="login-form" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="dealer-email">Email</label>
              <input id="dealer-email" type="email" placeholder="you@dealership.com" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="dealer-pw">Password</label>
              <input id="dealer-pw" type="password" placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="login-err">{error}</div>
            </div>
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing In…" : "Sign In"}
            </button>
          </form>

          <div className="login-meta">
            AUTHORIZED FOR &nbsp; <span>{(tenant?.dealership?.name || "").toUpperCase()}</span>
          </div>
          <p style={{ marginTop: 18, fontSize: 12 }}>
            <button type="button" className="link-btn" onClick={() => { setShowHelp((v) => !v); setForgot({}); }}>Forgot your password?</button>
          </p>
          {showHelp ? (
            <div className="notice" style={{ textAlign: "left", maxWidth: 420, margin: "10px auto 0" }}>
              {forgot.sent ? (
                <>If <b>{email.trim()}</b> has a login here, a reset link is on its way. It works once and expires in an hour — check spam if you don&apos;t see it in a minute.</>
              ) : forgot.noEmail ? (
                <>Email reset isn&apos;t switched on yet. Your dealership admin can reset it from <b>Settings → Team logins</b>; if you&apos;re the admin, call or text White Glove Auto.</>
              ) : (
                <>
                  Enter your email above and we&apos;ll send you a link to choose a new one.
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="btn-primary btn-sm" disabled={forgot.busy} onClick={sendReset}>{forgot.busy ? "Sending…" : "Email me a reset link"}</button>
                  </div>
                  {forgot.err ? <div className="login-err" style={{ marginTop: 8 }}>{forgot.err}</div> : null}
                </>
              )}
            </div>
          ) : null}
          <p style={{ marginTop: 22, fontSize: 11, letterSpacing: "0.12em" }}>
            <Link href="/wga" style={{ color: "var(--text-3)" }}>WHITE GLOVE AUTO STAFF →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
