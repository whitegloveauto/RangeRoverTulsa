"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import PriceGrid, { type GridChange } from "@/components/PriceGrid";
import { useDealerSession } from "@/lib/useDealerSession";
import type { PricingBook, DealerUser } from "@/lib/types";

// Dealership admin: set your own customer prices, hide WGA cost from your team, manage logins.
export default function DealerSettingsPage() {
  const { session, ready } = useDealerSession();
  const [tab, setTab] = useState<"pricing" | "team" | "settings">("pricing");
  const [book, setBook] = useState<PricingBook | null>(null);
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [hideCost, setHideCost] = useState(false);
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "pw"; user: DealerUser }>(null);

  async function loadAll() {
    const [b, u, s] = await Promise.all([fetch("/api/pricing"), fetch("/api/dealer/users"), fetch("/api/dealer/settings")]);
    if (b.ok) setBook(await b.json());
    if (u.ok) setUsers((await u.json()).users || []);
    if (s.ok) setHideCost(!!(await s.json()).settings?.hide_cost_from_users);
  }
  useEffect(() => {
    if (ready) loadAll();
  }, [ready]);

  async function saveRetail(changes: GridChange[]) {
    const res = await fetch("/api/dealer/retail", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cells: changes.map((c) => ({ model: c.model, item_id: c.item_id, retail: c.retail ?? null })) }) });
    if (!res.ok) throw new Error((await res.json()).error || "Save failed");
  }
  async function toggleHide(v: boolean) {
    setHideCost(v);
    const res = await fetch("/api/dealer/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hide_cost_from_users: v }) });
    setMsg(res.ok ? "Saved" : "Could not save");
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
    <div className="frame">
      <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
      <main>
        <div className="stage" style={{ maxWidth: 1180 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">DEALERSHIP SETTINGS</div>
            <div className="stage-title">Your pricing &amp; team.</div>
          </div>
          <div className="tabs">
            <button className={tab === "pricing" ? "active" : ""} onClick={() => setTab("pricing")}>Your prices</button>
            <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Team logins</button>
            <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Visibility</button>
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
            <>
              <div className="toolbar">
                <span className="grow" />
                <button className="btn-primary btn-sm" onClick={() => setModal({ kind: "new" })}>+ Add login</button>
              </div>
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td><b>{u.name}</b></td>
                        <td>{u.email}</td>
                        <td>
                          <select value={u.role} onChange={(e) => userAction({ action: "update", id: u.id, role: e.target.value }).catch((er) => setMsg(er.message))}>
                            <option value="user">Sales</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td><span className={"status-pill " + (u.active ? "scheduled" : "cancelled")}>{u.active ? "Active" : "Disabled"}</span>{u.must_change_password ? <div style={{ fontSize: 10, marginTop: 4 }}>Must set password</div> : null}</td>
                        <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "Never"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="link-btn" onClick={() => setModal({ kind: "pw", user: u })}>Reset password</button>
                          <button className="link-btn danger" onClick={() => userAction({ action: "update", id: u.id, active: !u.active }).catch((er) => setMsg(er.message))}>{u.active ? "Disable" : "Enable"}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="err">{msg}</div>
            </>
          ) : null}

          {tab === "settings" ? (
            <div className="card">
              <h3>What your sales team sees</h3>
              <p>Admins always see White Glove Auto's cost. Turn this on to show your sales team only your customer prices.</p>
              <label className="check" style={{ marginTop: 16 }}>
                <input type="checkbox" checked={hideCost} onChange={(e) => toggleHide(e.target.checked)} /> Hide WGA cost from sales users
              </label>
              <div className="err" style={{ color: "var(--gold-bright)" }}>{msg}</div>
            </div>
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
        <h3>{modal.kind === "new" ? "Add a login" : `Reset password · ${modal.user.name}`}</h3>
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
