"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import PriceGrid, { type GridChange } from "@/components/PriceGrid";
import StatementView from "@/components/StatementView";
import TeamManager, { AccessToggles, type AccessSnapshot } from "@/components/TeamManager";
import { useDealerSession } from "@/lib/useDealerSession";
import type { PricingBook, DealerUser } from "@/lib/types";

// Dealership admin: your customer prices, your team (per-person access + invites), team defaults, statements.
export default function DealerSettingsPage() {
  const { session, ready } = useDealerSession();
  const [tab, setTab] = useState<"pricing" | "team" | "settings" | "statements">("pricing");
  const [notify, setNotify] = useState<{ users: Record<string, string>; extra: string[] }>({ users: {}, extra: [] });
  const [emailOn, setEmailOn] = useState(true);
  const [extraText, setExtraText] = useState("");
  const [notifyMsg, setNotifyMsg] = useState("");
  const [book, setBook] = useState<PricingBook | null>(null);
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [snap, setSnap] = useState<AccessSnapshot | null>(null);
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "pw"; user: DealerUser }>(null);

  async function loadAll() {
    const [b, u, a, n] = await Promise.all([fetch("/api/pricing"), fetch("/api/dealer/users"), fetch("/api/dealer/access"), fetch("/api/dealer/notify")]);
    if (b.ok) setBook(await b.json());
    if (u.ok) setUsers((await u.json()).users || []);
    if (a.ok) setSnap(await a.json());
    if (n.ok) {
      const d = await n.json();
      setNotify(d.prefs);
      setExtraText((d.prefs.extra || []).join(", "));
      setEmailOn(!!d.emailConfigured);
    }
  }
  useEffect(() => {
    if (ready) loadAll();
  }, [ready]);

  async function saveRetail(changes: GridChange[]) {
    const res = await fetch("/api/dealer/retail", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cells: changes.map((c) => ({ model: c.model, item_id: c.item_id, retail: c.retail ?? null })) }) });
    if (!res.ok) throw new Error((await res.json()).error || "Save failed");
  }
  async function saveDefaults(patch: any) {
    setMsg("");
    const r = await fetch("/api/dealer/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaults: patch }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(d.error || "Could not save");
    setSnap(d);
    setMsg("Saved");
  }
  async function runSetupAgain() {
    await fetch("/api/dealer/access", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ setupReset: true }) });
    window.location.href = "/portal/setup";
  }
  async function saveNotify(body: { users?: Record<string, string>; extra?: string[] }) {
    setNotifyMsg("");
    const res = await fetch("/api/dealer/notify", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) return setNotifyMsg(d.error || "Could not save");
    setNotify(d.prefs);
    setNotifyMsg("Saved");
  }
  async function userAction(body: any) {
    const res = await fetch("/api/dealer/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Failed");
    await loadAll();
  }

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  if (session.user.role !== "admin") {
    return (
      <div className="frame">
        <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
        <main><div className="stage"><div className="notice warn">Settings are for dealership admins. Ask your manager if you need pricing or login changes.</div></div></main>
      </div>
    );
  }

  return (
    <div className={"frame" + (tab === "statements" ? " stmt-page" : "")}>
      <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
      <main>
        <div className="stage" style={{ maxWidth: 1180 }}>
          <div className="stage-head no-print">
            <div className="stage-eyebrow">DEALERSHIP SETTINGS</div>
            <div className="stage-title">Your pricing &amp; team.</div>
          </div>
          <div className="tabs">
            <button className={tab === "pricing" ? "active" : ""} onClick={() => setTab("pricing")}>Your prices</button>
            <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Team</button>
            <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Team defaults &amp; emails</button>
            <button className={tab === "statements" ? "active" : ""} onClick={() => setTab("statements")}>Statements</button>
          </div>

          {tab === "pricing" && book ? (
            <>
              <div className="notice">
                <b>Your price</b> is what your customers see on quotes and printed sheets. Leave a cell on White Glove's suggested retail or type your own number. WGA cost is what White Glove Auto bills your dealership.
              </div>
              <PriceGrid book={book} mode="dealer" onSave={saveRetail} />
            </>
          ) : null}

          {tab === "team" ? (
            snap ? (
              <TeamManager users={users} snap={snap} meId={session.user.id} onChanged={loadAll} onSetPassword={(u) => setModal({ kind: "pw", user: u })} />
            ) : <div className="loading-text">Loading your team…</div>
          ) : null}

          {tab === "statements" ? (
            <>
              <div className="notice no-print">Your completed work at White Glove Auto&apos;s price for each pay period — what you&apos;ll be billed and when. Download the CSV or print it for accounts payable.</div>
              <StatementView endpoint="/api/statements" audience="dealer" />
            </>
          ) : null}

          {tab === "settings" ? (
            <>
            <div className="card">
              <h3>Update emails</h3>
              <p>White Glove Auto emails your team when an order is scheduled, goes into the shop, is complete, gets QC photos or a reply, and when a comeback is updated. Each person&apos;s level (their orders, every order, or none) is set on <b>Team</b>.</p>
              {!emailOn ? <div className="notice warn" style={{ marginTop: 12 }}>Email sending isn&apos;t switched on yet on White Glove&apos;s side, so nothing goes out until it is. Your settings here are saved either way.</div> : null}
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="extra">Also send every update to (comma-separated)</label>
                <input id="extra" value={extraText} placeholder="salesmanager@dealership.com, desk@dealership.com" onChange={(e) => setExtraText(e.target.value)} onBlur={() => {
                  const list = extraText.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
                  if (list.join(",") !== (notify.extra || []).join(",")) saveNotify({ extra: list });
                }} />
              </div>
              <div className="err" style={{ color: notifyMsg === "Saved" ? "var(--gold-bright)" : undefined }}>{notifyMsg}</div>
            </div>
            {snap ? (
              <div className="card">
                <h3>Team defaults</h3>
                <p>What a salesperson gets when you add them. Change one person any time on <b>Team</b> — their own settings win. Admins always see everything.</p>
                <div style={{ marginTop: 10 }}><AccessToggles questions={snap.questions} value={snap.defaults} onChange={(k, v) => saveDefaults({ [k]: v })} /></div>
                <div className="err" style={{ color: msg === "Saved" ? "var(--gold-bright)" : undefined }}>{msg}</div>
              </div>
            ) : null}
            <div className="card">
              <h3>First-time setup</h3>
              <p>{snap?.setup?.done ? `Finished${snap.setup.by ? ` by ${snap.setup.by}` : ""}${snap.setup.at ? ` on ${new Date(snap.setup.at).toLocaleDateString()}` : ""}. ` : "Not finished yet. "}Walk through it again to re-answer the questions or invite more people.</p>
              <button className="btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={runSetupAgain}>Run setup again</button>
            </div>
            </>
          ) : null}
        </div>
      </main>

      {modal ? <UserModal modal={modal} onClose={() => setModal(null)} onSubmit={userAction} /> : null}
    </div>
  );
}

function UserModal({ modal, onClose, onSubmit }: { modal: { kind: "new" } | { kind: "pw"; user: DealerUser }; onClose: () => void; onSubmit: (b: any) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (modal.kind === "new") await onSubmit({ action: "create", name, email, role, password });
      else await onSubmit({ action: "password", id: modal.user.id, password });
      onClose();
    } catch (er: any) {
      setErr(er.message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={go}>
        <h3>{modal.kind === "new" ? "Add a login" : `Set a password · ${modal.user.name}`}</h3>
        {modal.kind === "new" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="field"><label htmlFor="un">Name</label><input id="un" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="field"><label htmlFor="ue">Email</label><input id="ue" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="field"><label htmlFor="ur">Role</label><select id="ur" value={role} onChange={(e) => setRole(e.target.value)}><option value="user">Sales — quotes and orders</option><option value="admin">Admin — pricing, team, settings</option></select></div>
          </div>
        ) : null}
        <div className="field" style={{ marginTop: 14 }}><label htmlFor="up">Temporary password (8+ characters)</label><input id="up" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10 }}>They'll be asked to choose their own password at first sign-in.</p>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
