"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Choose-a-new-password form behind an emailed reset link (dealer and WGA sides).
export default function ResetForm({ api, signInHref }: { api: string; signInHref: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [state, setState] = useState<"checking" | "ok" | "dead">("checking");
  const [who, setWho] = useState<{ email: string; name: string }>({ email: "", name: "" });
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (!t) return setState("dead");
    fetch(`${api}?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) {
          setWho({ email: d.email, name: d.name });
          setState("ok");
        } else setState("dead");
      })
      .catch(() => setState("dead"));
  }, [api]);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return setErr("Passwords don't match.");
    setBusy(true);
    setErr("");
    const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(d.error || "Could not save.");
      setBusy(false);
      return;
    }
    router.push(`${signInHref}?reset=1`);
  }

  if (state === "checking") return <div className="loading-text">Checking your link…</div>;
  if (state === "dead")
    return (
      <>
        <h1 className="login-title">Link expired.</h1>
        <p className="login-sub">Reset links work once and only for an hour. Go back to sign-in and tap &ldquo;Forgot your password?&rdquo; for a fresh one.</p>
        <a className="btn-primary" href={signInHref} style={{ display: "inline-block", textAlign: "center", textDecoration: "none" }}>Back to sign-in</a>
      </>
    );
  return (
    <>
      <h1 className="login-title">New password.</h1>
      <p className="login-sub">{who.name ? `${who.name.split(" ")[0]}, pick` : "Pick"} a password only you know — 8 characters or more.</p>
      <form className="login-form" onSubmit={go}>
        {/* lets iOS / password managers save the new password against the right account */}
        <input type="email" autoComplete="username" value={who.email} readOnly hidden />
        <div className="field"><label htmlFor="np">New password</label><input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} autoFocus /></div>
        <div className="field"><label htmlFor="np2">Confirm new password</label><input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required minLength={8} /><div className="login-err">{err}</div></div>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </>
  );
}
