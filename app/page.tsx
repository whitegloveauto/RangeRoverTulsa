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
            <CoBrand size="login" logoUrl={tenant?.brand?.logo_url} brandName={tenant?.brand?.name} />
          </div>
          <h1 className="login-title">
            Dealership
            <br />
            Pricing Portal.
          </h1>
          <p className="login-sub">
            Vehicle-specific pricing for paint protection film, ceramic coating, window tint, and windshield protection — installed by White Glove Auto.
          </p>

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
            <button type="button" className="link-btn" onClick={() => setShowHelp((v) => !v)}>Forgot your password?</button>
          </p>
          {showHelp ? (
            <div className="notice" style={{ textAlign: "left", maxWidth: 420, margin: "10px auto 0" }}>
              Your dealership admin can reset it from <b>Settings → Team logins</b> in about ten seconds. If you&apos;re the admin, White Glove Auto can reset yours — call or text the shop.
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
