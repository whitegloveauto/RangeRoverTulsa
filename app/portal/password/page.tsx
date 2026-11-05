"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CoBrand from "@/components/CoBrand";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const first = sp.get("first") === "1";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setErr("New passwords don't match."); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/dealer/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current, next }) });
    const d = await res.json();
    if (!res.ok) { setErr(d.error || "Could not change password."); setBusy(false); return; }
    router.push("/portal/vehicle");
  }

  return (
    <div className="login-stage">
      <div style={{ marginBottom: 32 }}><CoBrand size="login" /></div>
      <h1 className="login-title">{first ? "Choose your password." : "Change password."}</h1>
      <p className="login-sub">{first ? "You signed in with a temporary password. Pick one only you know." : "Enter your current password, then your new one."}</p>
      <form className="login-form" onSubmit={go}>
        <div className="field"><label htmlFor="cur">{first ? "Temporary password" : "Current password"}</label><input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
        <div className="field"><label htmlFor="nw">New password (8+ characters)</label><input id="nw" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} /></div>
        <div className="field"><label htmlFor="cf">Confirm new password</label><input id="cf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /><div className="login-err">{err}</div></div>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </div>
  );
}

export default function PasswordPage() {
  return (
    <div className="frame"><main><Suspense fallback={null}><Inner /></Suspense></main></div>
  );
}
