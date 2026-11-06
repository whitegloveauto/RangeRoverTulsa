"use client";

import WgaTheme from "@/components/WgaTheme";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWgaSession } from "@/lib/useDealerSession";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const first = sp.get("first") === "1";
  const { session, ready } = useWgaSession({ gate: false });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setErr("New passwords don't match.");
      return;
    }
    setBusy(true);
    setErr("");
    const res = await fetch("/api/wga/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
    const d = await res.json();
    if (!res.ok) {
      setErr(d.error || "Could not change password.");
      setBusy(false);
      return;
    }
    router.push(d.next || "/wga/orders");
  }

  if (!ready || !session) return <div className="login-stage"><div className="loading-text">Loading…</div></div>;

  return (
    <div className="login-stage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/wga-white.png" alt="White Glove Auto" style={{ height: 34, width: "auto", marginBottom: 36 }} />
      <div className="login-eyebrow">DEALER PROGRAM · WHITE GLOVE AUTO</div>
      <h1 className="login-title">{first ? "Choose your password." : "Change password."}</h1>
      <p className="login-sub">{first ? "You signed in with a temporary password. Pick one only you know — it's the same password for the White Glove portal and the app." : "Enter your current password, then your new one. This changes it everywhere you sign in as White Glove."}</p>
      <form className="login-form" onSubmit={go}>
        <div className="field"><label htmlFor="cur">{first ? "Temporary password" : "Current password"}</label><input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
        <div className="field"><label htmlFor="nw">New password (8+ characters)</label><input id="nw" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} /></div>
        <div className="field"><label htmlFor="cf">Confirm new password</label><input id="cf" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /><div className="login-err">{err}</div></div>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
      {!first ? <p style={{ marginTop: 18, fontSize: 12 }}><button className="link-btn" onClick={() => router.back()}>Cancel</button></p> : null}
    </div>
  );
}

export default function WgaPasswordPage() {
  return (
    <div className="frame"><WgaTheme /><main><Suspense fallback={null}><Inner /></Suspense></main></div>
  );
}
