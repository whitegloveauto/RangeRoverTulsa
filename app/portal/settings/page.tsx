"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import PriceGrid, { type GridChange } from "@/components/PriceGrid";
import StatementView from "@/components/StatementView";
import { useDealerSession } from "@/lib/useDealerSession";
import { useIsPhone } from "@/lib/useIsPhone";
import type { PricingBook, DealerUser } from "@/lib/types";

// Dealership admin: set your own customer prices, hide WGA cost from your team, manage logins.
export default function DealerSettingsPage() {
  const { session, ready } = useDealerSession();
  const isPhone = useIsPhone();
  const [tab, setTab] = useState<"pricing" | "team" | "settings" | "statements">("pricing");
  const [notify, setNotify] = useState<{ users: Record<string, string>; extra: string[] }>({ users: {}, extra: [] });
  const [emailOn, setEmailOn] = useState(true);
  const [extraText, setExtraText] = useState("");
  const [notifyMsg, setNotifyMsg] = useState("");
  const [book, setBook] = useState<PricingBook | null>(null);
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [hideCost, setHideCost] = useState(false);
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState<null | { kind: "new" } | { kind: "pw"; user: DealerUser }>(null);

  async function loadAll() {
    const [b, u, s, n] = await Promise.all([fetch("/api/pricing"), fetch("/api/dealer/users"), fetch("/api/dealer/settings"), fetch("/api/dealer/notify")]);
    if (b.ok) setBook(await b.json());
    if (u.ok) setUsers((await u.json()).users || []);
    if (s.ok) setHideCost(!!(await s.json()).settings?.hide_cost_from_users);
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
  async function toggleHide(v: boolean) {
    setHideCost(v);
    const res = await fetch("/api/dealer/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hide_cost_from_users: v }) });
    setMsg(res.ok ? "Saved" : "Could not save");
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
            <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Team logins</button>
            <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Emails &amp; visibility</button>
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
            <>
              <div className="toolbar">
                <span className="grow" />
                <button className="btn-primary btn-sm" onClick={() => setModal({ kind: "new" })}>+ Add login</button>
              </div>
              {isPhone ? (
                <div className="order-cards">
                  {users.map((u) => (
                    <div key={u.id} className="card" style={{ padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                        <b>{u.name}</b>
                        <span className={"status-pill " + (u.active ? "scheduled" : "cancelled")}>{u.active ? "Active" : "Disabled"}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{u.email} · last sign-in {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "never"}{u.must_change_password ? " · must set password" : ""}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                        <div className="field"><label>Role</label>
                          <select value={u.role} onChange={(e) => userAction({ action: "update", id: u.id, role: e.target.value }).catch((er) => setMsg(er.message))}>
                            <option value="user">Sales</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        <div className="field"><label>Update emails</label>
                          <select value={notify.users[u.id] || "mine"} onChange={(e) => saveNotify({ users: { [u.id]: e.target.value } })}>
                            <option value="mine">Their orders</option>
                            <option value="all">Every order</option>
                            <option value="off">Off</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                        <button className="link-btn" onClick={() => setModal({ kind: "pw", user: u })}>Reset password</button>
                        <button className="link-btn danger" onClick={() => userAction({ action: "update", id: u.id, active: !u.active }).catch((er) => setMsg(er.message))}>{u.active ? "Disable" : "Enable"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th title="Order and comeback update emails">Update emails</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
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
                        <td>
                          <select value={notify.users[u.id] || "mine"} onChange={(e) => saveNotify({ users: { [u.id]: e.target.value } })}>
                            <option value="mine">Their orders</option>
                            <option value="all">Every order</option>
                            <option value="off">Off</option>
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
              )}
              <div className="err">{msg}</div>
            </>
          ) : null}

          {tab === "statements" ? (
            <>
              <div className="notice no-print">Each month&apos;s completed work at White Glove Auto&apos;s price — what you&apos;ll be billed, with your terms. Download the CSV or print it for accounts payable.</div>
              <StatementView endpoint="/api/statements" audience="dealer" />
            </>
          ) : null}

          {tab === "settings" ? (
            <>
            <div className="card">
              <h3>Update emails</h3>
              <p>White Glove Auto emails your team when an order is scheduled, goes into the shop, is complete, gets QC photos or a reply, and when a comeback is updated. By default each person hears about the orders they placed — change that per person on <b>Team logins</b>.</p>
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
            <div className="card">
              <h3>What your sales team sees</h3>
              <p>Admins always see White Glove Auto's cost. Turn this on to show your sales team only your customer prices.</p>
              <label className="check" style={{ marginTop: 16 }}>
                <input type="checkbox" checked={hideCost} onChange={(e) => toggleHide(e.target.checked)} /> Hide WGA cost from sales users
              </label>
              <div className="err" style={{ color: "var(--gold-bright)" }}>{msg}</div>
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
