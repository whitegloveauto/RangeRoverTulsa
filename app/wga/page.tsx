"use client";

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
              <h1 className="login-title">Admin.</h1>
              <p className="login-sub">Same email and password as the White Glove portal. After you sign in, this browser will let you use your PIN next time.</p>
              <form className="login-form" onSubmit={submitPassword}>
                <div className="field"><label htmlFor="we">Email</label><input id="we" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                <div className="field"><label htmlFor="wp">Password</label><input id="wp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><div className="login-err">{error}</div></div>
                <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Signing In…" : "Sign In"}</button>
              </form>
              {device?.hasPin ? <p style={{ marginTop: 18, fontSize: 12 }}><button className="link-btn" onClick={() => { setMode("pin"); setError(""); }}>Use PIN instead</button></p> : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
