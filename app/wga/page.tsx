"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// White Glove Auto sign-in for the dealer program admin side.
export default function WgaLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/wga/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.authenticated) router.replace("/wga/orders");
      })
      .catch(() => {});
  }, [router]);

  async function go(e: React.FormEvent) {
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
    router.push(d.user.role === "admin" ? "/wga/pricing" : "/wga/orders");
  }

  return (
    <div className="frame">
      <main>
        <div className="login-stage">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wga-white.png" alt="White Glove Auto" style={{ height: 34, width: "auto", marginBottom: 36 }} />
          <div className="login-eyebrow">DEALER PROGRAM · WHITE GLOVE AUTO</div>
          <h1 className="login-title">Admin.</h1>
          <p className="login-sub">Same email and password as the White Glove portal. Admins manage pricing and dealerships; team members work orders.</p>
          <form className="login-form" onSubmit={go}>
            <div className="field"><label htmlFor="we">Email</label><input id="we" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="field"><label htmlFor="wp">Password</label><input id="wp" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><div className="login-err">{error}</div></div>
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Signing In…" : "Sign In"}</button>
          </form>
        </div>
      </main>
    </div>
  );
}
