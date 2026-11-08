"use client";

import WgaTheme from "@/components/WgaTheme";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// White Glove Auto sign-in for the dealer program admin side.
// A browser that has signed in with a password once becomes trusted and gets
// the PIN screen; "Use password" is always one tap away.
export default function WgaLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [device, setDevice] = useState<null | { name: string; email: string; hasPin: boolean }>(null);
  const [mode, setMode] = useState<"loading" | "pin" | "password">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState<null | { busy?: boolean; sent?: boolean; noEmail?: boolean; err?: string }>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reset") === "1") setNotice("Password updated — sign in with your new one. It's the same password for the White Glove app.");
  }, []);

  async function sendReset() {
    const addr = email.trim();
    if (!addr) return setForgot({ err: "Type your email above first." });
    setForgot({ busy: true });
    const r = await fetch("/api/wga/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: addr }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setForgot({ err: d.error || "Could not send." });
    setForgot(d.emailConfigured === false ? { noEmail: true } : { sent: true });
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await fetch("/api/wga/auth/session").then((r) => (r.ok ? r.json() : null));
        if (s?.authenticated) {
          router.replace(s.mustChangePassword ? "/wga/password?first=1" : !s.hasPin ? "/wga/pin?setup=1" : "/wga/orders");
          return;
        }
        const d = await fetch("/api/wga/auth/pin").then((r) => (r.ok ? r.json() : null));
        if (d?.device?.hasPin) {
          setDevice(d.device);
          setMode("pin");
        } else setMode("password");
      } catch {
        setMode("password");
      }
    })();
  }, [router]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/wga/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign-in failed.");
      setBusy(false);
      return;
    }
    router.push(d.next || "/wga/orders");
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/wga/auth/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", pin }) });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Sign-in failed.");
      setPin("");
      setBusy(false);
      return;
    }
    router.push(d.next || "/wga/orders");
  }

  async function forgetDevice() {
    await fetch("/api/wga/auth/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "forget" }) });
    setDevice(null);
    setMode("password");
  }

  return (
    <div className="frame">
      <WgaTheme />
      <main>
        <div className="login-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wga-white.png" alt="White Glove Auto" style={{ height: 34, width: "auto", marginBottom: 36 }} />
          <div className="login-eyebrow">DEALER PROGRAM · WHITE GLOVE AUTO</div>

          {mode === "loading" ? <div className="loading-text">Loading…</div> : null}

          {mode === "pin" && device ? (
            <>
              <h1 className="login-title">Welcome back, {device.name.split(" ")[0]}.</h1>
              <p className="login-sub">Enter your PIN to continue.</p>
              <form className="login-form" onSubmit={submitPin}>
                <div className="field">
                  <label htmlFor="pin">PIN</label>
                  <input id="pin" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" autoFocus maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required style={{ letterSpacing: "0.4em", fontSize: 22, textAlign: "center" }} />
                  <div className="login-err">{error}</div>
                </div>
                <button className="btn-primary" type="submit" disabled={busy || pin.length < 4}>{busy ? "Checking…" : "Sign In"}</button>
              </form>
              <p style={{ marginTop: 18, fontSize: 12, color: "var(--text-3)" }}>
                <button className="link-btn" onClick={() => { setMode("password"); setError(""); }}>Use password instead</button>
                {" · "}
                <button className="link-btn" onClick={forgetDevice}>Not {device.name.split(" ")[0]}?</button>
              </p>
            </>
          ) : null}

          {mode === "password" ? (
            <>
              {notice ? <div className="notice" style={{ maxWidth: 420, margin: "0 auto 18px" }}>{notice}</div> : null}
              <h1 className="login-title">Admin.</h1>
              <p className="login-sub">Same email and password as the White Glove portal. After you sign in, this browser will let you use your PIN next time.</p>
              <form className="login-form" onSubmit={submitPassword}>
                <div className="field"><label htmlFor="we">Email</label><input id="we" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div className="field"><label htmlFor="wp">Password</label><input id="wp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><div className="login-err">{error}</div></div>
                <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Signing In…" : "Sign In"}</button>
              </form>
              <p style={{ marginTop: 18, fontSize: 12 }}>
                {device?.hasPin ? <><button className="link-btn" onClick={() => { setMode("pin"); setError(""); }}>Use PIN instead</button>{" · "}</> : null}
                <button className="link-btn" onClick={() => setForgot(forgot ? null : {})}>Forgot your password?</button>
              </p>
              {forgot ? (
                <div className="notice" style={{ textAlign: "left", maxWidth: 420, margin: "10px auto 0" }}>
                  {forgot.sent ? (
                    <>If <b>{email.trim()}</b> is a White Glove account, a reset link is on its way (one use, one hour).</>
                  ) : forgot.noEmail ? (
                    <>Email reset isn&apos;t switched on yet — Myron can reset it from the White Glove portal.</>
                  ) : (
                    <>
                      Enter your email above and we&apos;ll email you a link to set a new password.
                      <div style={{ marginTop: 10 }}><button type="button" className="btn-primary btn-sm" disabled={forgot.busy} onClick={sendReset}>{forgot.busy ? "Sending…" : "Email me a reset link"}</button></div>
                      {forgot.err ? <div className="login-err" style={{ marginTop: 8 }}>{forgot.err}</div> : null}
                    </>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
