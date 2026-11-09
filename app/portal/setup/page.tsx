"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CoBrand from "@/components/CoBrand";
import { AccessToggles, InviteForm, InviteLink, type AccessSnapshot, type Access } from "@/components/TeamManager";
import { SETUP_SKIP_KEY, useDealerSession } from "@/lib/useDealerSession";
import type { DealerUser } from "@/lib/types";

// First-time setup for a dealership admin: about you → what your team can see → invite your team → done.
// Everything here can be changed later in Settings.
const STEPS = ["You", "Your team's access", "Invite your team", "Done"] as const;

export default function SetupPage() {
  const router = useRouter();
  const { session, ready } = useDealerSession();
  const [step, setStep] = useState(0);
  const [snap, setSnap] = useState<AccessSnapshot | null>(null);
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [me, setMe] = useState({ name: "", title: "", phone: "", emails: "mine" });
  const [defaults, setDefaults] = useState<Access | null>(null);
  const [teamEmails, setTeamEmails] = useState("mine");
  const [extra, setExtra] = useState("");
  const [invited, setInvited] = useState<{ user: DealerUser; link: string; emailed: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const [a, u] = await Promise.all([fetch("/api/dealer/access"), fetch("/api/dealer/users")]);
    if (a.ok) {
      const d: AccessSnapshot = await a.json();
      setSnap(d);
      setDefaults((cur) => cur || d.defaults);
      setExtra((d.notify.extra || []).join(", "));
    }
    if (u.ok) setUsers((await u.json()).users || []);
  }
  useEffect(() => {
    if (!ready || !session) return;
    if (session.user.role !== "admin") {
      router.replace("/portal/vehicle");
      return;
    }
    setMe((m) => ({ ...m, name: session.user.name }));
    load();
  }, [ready, session, router]);
  useEffect(() => {
    if (snap && session?.user.id) {
      const p = snap.profiles[session.user.id] || {};
      setMe((m) => ({ ...m, title: m.title || p.title || "", phone: m.phone || p.phone || "", emails: snap.notify.users[session.user.id!] || m.emails }));
    }
  }, [snap, session]);

  async function put(body: any) {
    const r = await fetch("/api/dealer/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Could not save.");
    setSnap(d);
    return d;
  }

  async function next() {
    setErr("");
    setBusy(true);
    try {
      if (step === 0) {
        if (!me.name.trim()) throw new Error("Add your name.");
        const extraList = extra.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
        const bad = extraList.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
        if (bad.length) throw new Error(`Not an email address: ${bad.join(", ")}`);
        await put({ profile: { name: me.name, title: me.title, phone: me.phone }, notify: { users: session?.user.id ? { [session.user.id]: me.emails } : {}, extra: extraList } });
      }
      if (step === 1 && defaults) await put({ defaults });
      if (step === 2) {
        // new salespeople inherit the email level picked on step 2
        const ids = invited.filter((i) => i.user.role === "user").map((i) => i.user.id);
        if (ids.length) await put({ notify: { users: Object.fromEntries(ids.map((id) => [id, teamEmails])) } });
        await put({ setupDone: true });
        try {
          sessionStorage.removeItem(SETUP_SKIP_KEY);
        } catch {}
      }
      setStep((s) => Math.min(STEPS.length - 1, s + 1));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  }

  function later() {
    try {
      sessionStorage.setItem(SETUP_SKIP_KEY, "1");
    } catch {}
    router.push("/portal/vehicle");
  }

  if (!ready || !session || !snap || !defaults) {
    return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Getting your setup ready…</div></div></main></div>;
  }
  const first = (me.name || session.user.name).split(" ")[0];
  const others = users.filter((u) => u.id !== session.user.id);

  return (
    <div className="frame">
      <main>
        <div className="stage setup">
          <div style={{ marginBottom: 28 }}>
            <CoBrand size="header" logoUrl={session.brand?.logo_url} brandName={session.brand?.name} />
          </div>
          <div className="setup-steps" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => <span key={s} className={i <= step ? "done" : ""} title={s} />)}
          </div>

          {step === 0 ? (
            <>
              <div className="setup-kicker">Step 1 of 3 · You</div>
              <h1 className="setup-title">Welcome, {first}. Let&apos;s set up {session.dealership.short_name || session.dealership.name}.</h1>
              <p className="setup-sub">Three quick steps: you, what your salespeople can see, and inviting them. You can change any of it later under Settings.</p>
              <div className="setup-fields">
                <div className="field"><label htmlFor="su-name">Your name</label><input id="su-name" value={me.name} onChange={(e) => { const v = e.target.value; setMe((m) => ({ ...m, name: v })); }} autoComplete="name" /></div>
                <div className="field"><label htmlFor="su-title">Your title</label><input id="su-title" value={me.title} onChange={(e) => { const v = e.target.value; setMe((m) => ({ ...m, title: v })); }} placeholder="Sales Manager" autoComplete="organization-title" /></div>
                <div className="field"><label htmlFor="su-phone">Mobile (optional)</label><input id="su-phone" type="tel" inputMode="tel" value={me.phone} onChange={(e) => { const v = e.target.value; setMe((m) => ({ ...m, phone: v })); }} placeholder="(918) 555-0100" autoComplete="tel" /></div>
                <div className="field"><label htmlFor="su-emails">Order update emails to you</label>
                  <select id="su-emails" value={me.emails} onChange={(e) => { const v = e.target.value; setMe((m) => ({ ...m, emails: v })); }}>
                    <option value="all">Every order at the dealership</option>
                    <option value="mine">Only orders I place</option>
                    <option value="off">None</option>
                  </select>
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="su-extra">Also send every update to (optional)</label><input id="su-extra" type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="desk@dealership.com, gm@dealership.com" /></div>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="setup-kicker">Step 2 of 3 · Your team&apos;s access</div>
              <h1 className="setup-title">What should your salespeople see?</h1>
              <p className="setup-sub">These are the defaults for every salesperson you add. You can change any one person later — admins always see everything.</p>
              <AccessToggles big questions={snap.questions} value={defaults} onChange={(k, v) => setDefaults({ ...defaults, [k]: v })} />
              <div className="access-row" style={{ paddingTop: 18 }}>
                <div className="access-text">
                  <div className="access-q" style={{ fontSize: 16 }}>Which order emails should salespeople get?</div>
                  <div className="access-help">When an order is scheduled, in the shop, done, gets QC photos or a reply from White Glove.</div>
                </div>
                <select value={teamEmails} onChange={(e) => setTeamEmails(e.target.value)} style={{ maxWidth: 200 }}>
                  <option value="mine">Their own orders</option>
                  <option value="all">Every order</option>
                  <option value="off">None</option>
                </select>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="setup-kicker">Step 3 of 3 · Invite your team</div>
              <h1 className="setup-title">Who should be on here?</h1>
              <p className="setup-sub">Add each salesperson (or another manager). They get a link to set their own password{snap.emailConfigured ? " — we email it, and you can text it too" : " — text or send it to them right from here"}. You can skip this and add people later.</p>
              <div className="card"><InviteForm snap={{ ...snap, defaults }} onInvited={async (r) => { setInvited((x) => [r, ...x]); await load(); }} /></div>
              {invited.length ? (
                <div className="setup-invited">
                  {invited.map((i) => <InviteLink key={i.user.id} name={i.user.name} link={i.link} emailed={i.emailed} />)}
                </div>
              ) : null}
              {others.length && !invited.length ? <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 12 }}>Already on here: {others.map((u) => u.name).join(", ")}.</p> : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="setup-kicker">All set</div>
              <h1 className="setup-title">You&apos;re ready, {first}.</h1>
              <div className="setup-summary">
                <div>Salespeople {defaults.see_cost ? <b>see</b> : <b>don&apos;t see</b>} your cost &amp; margin, {defaults.see_all_orders ? <b>see everyone&apos;s orders</b> : <b>see only their own orders</b>}, {defaults.master_sheet ? "have" : "don't have"} the master price sheet, and {defaults.comebacks ? "can" : "can't"} file comebacks.</div>
                <div>{invited.length ? <><b>{invited.length}</b> {invited.length === 1 ? "person" : "people"} invited.</> : "No one invited yet — you can do that any time."}</div>
                <div>Change anything under <b>Settings → Team</b> (per person) or <b>Settings → Team defaults</b>.</div>
              </div>
              <div className="setup-nav">
                <button className="btn-ghost" onClick={() => router.push("/portal/settings")}>Go to Settings</button>
                <div className="right"><button className="btn-primary" onClick={() => router.push("/portal/vehicle")}>Start a quote</button></div>
              </div>
            </>
          ) : null}

          {err ? <div className="notice warn" style={{ marginTop: 16 }}>{err}</div> : null}

          {step < 3 ? (
            <div className="setup-nav">
              {step === 0 ? <button className="link-btn" onClick={later}>Finish later</button> : <button className="btn-ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>Back</button>}
              <div className="right">
                <button className="btn-primary" onClick={next} disabled={busy}>{busy ? "Saving…" : step === 2 ? (invited.length ? "Finish" : "Skip & finish") : "Continue"}</button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
