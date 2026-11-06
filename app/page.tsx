"use client";

import Link from "next/link";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CoBrand from "@/components/CoBrand";

// Single dealership for now; becomes a subdomain/slug lookup when more are added.
const DEALERSHIP_SLUG = "range-rover-tulsa";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        body: JSON.stringify({ slug: DEALERSHIP_SLUG, email: email.trim(), password }),
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
            <CoBrand size="login" />
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
            AUTHORIZED FOR &nbsp; <span>RANGE ROVER · TULSA</span>
          </div>
          <p style={{ marginTop: 28, fontSize: 11, letterSpacing: "0.12em" }}>
            <Link href="/wga" style={{ color: "var(--text-3)" }}>WHITE GLOVE AUTO STAFF →</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
