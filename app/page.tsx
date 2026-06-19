"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CoBrand from "@/components/CoBrand";

// For now the portal serves a single dealership brand (Range Rover · Tulsa).
// The slug is fixed here; when multiple dealerships exist, this becomes a
// subdomain or path param that selects the slug.
const DEALERSHIP_SLUG = "range-rover-tulsa";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // If already authenticated, skip straight to the portal.
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
      setError("Enter the dealership password to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: DEALERSHIP_SLUG, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sign-in failed.");
        setBusy(false);
        return;
      }
      router.push("/portal/vehicle");
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
            Authorized access to vehicle-specific paint protection film, ceramic
            coating, and window film pricing — built directly into the XPEL
            Design Access Program.
          </p>

          <form className="login-form" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="dealer-pw">Dealership Password</label>
              <input
                id="dealer-pw"
                type="password"
                placeholder="Enter shared dealership password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="login-err">{error}</div>
            </div>
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing In…" : "Sign In"}
            </button>
          </form>

          <div className="login-meta">
            AUTHORIZED FOR &nbsp; <span>RANGE ROVER · TULSA</span>
          </div>
        </div>
      </main>
    </div>
  );
}
