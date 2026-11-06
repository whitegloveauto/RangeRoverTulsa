"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWgaSession } from "@/lib/useDealerSession";

const pinInput = { letterSpacing: "0.4em", fontSize: 22, textAlign: "center" as const };

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const setup = sp.get("setup") === "1";
  const { session, ready } = useWgaSession({ gate: false });
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (pin !== confirm) {
      setErr("PINs don't match.");
      return;
    }
    setBusy(true);
    setErr("");
    const res = await fetch("/api/wga/auth/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "set", pin, current }) });
    const d = await res.json();
    if (!res.ok) {
      setErr(d.error || "Could not save PIN.");
      setBusy(false);
      return;
    }
    router.push(d.next || "/wga/orders");
  }

  if (!ready || !session) return <div className="login-stage"><div className="loading-text">Loading…</div></div>;
  const changing = session.hasPin && !setup;

  return (
    <div className="login-stage">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/wga-white.png" alt="White Glove Auto" style={{ height: 34, width: "auto", marginBottom: 36 }} />
      <div className="login-eyebrow">DEALER PROGRAM · WHITE GLOVE AUTO</div>
      <h1 className="login-title">{changing ? "Change your PIN." : "Set a PIN."}</h1>
      <p className="login-sub">{changing ? "Enter your current PIN, then the new one." : "4 to 6 digits. From now on this browser signs you in with just the PIN — your password is still there as a fallback. Five wrong PINs locks it for 15 minutes."}</p>
      <form className="login-form" onSubmit={go}>
        {changing ? <div className="field"><label htmlFor="cp">Current PIN</label><input id="cp" type="password" inputMode="numeric" value={current} onChange={(e) => setCurrent(digits(e.target.value))} required style={pinInput} /></div> : null}
        <div className="field"><label htmlFor="np">{changing ? "New PIN" : "PIN"}</label><input id="np" type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(digits(e.target.value))} required minLength={4} style={pinInput} /></div>
        <div className="field"><label htmlFor="cf">Confirm PIN</label><input id="cf" type="password" inputMode="numeric" value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} required style={pinInput} /><div className="login-err">{err}</div></div>
        <button className="btn-primary" type="submit" disabled={busy || pin.length < 4}>{busy ? "Saving…" : "Save PIN"}</button>
      </form>
      {changing ? <p style={{ marginTop: 18, fontSize: 12 }}><button className="link-btn" onClick={() => router.back()}>Cancel</button></p> : null}
    </div>
  );
}

export default function WgaPinPage() {
  return (
    <div className="frame"><main><Suspense fallback={null}><Inner /></Suspense></main></div>
  );
}
