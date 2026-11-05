"use client";

import { useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import { useWgaSession } from "@/lib/useDealerSession";
import type { DealerUser } from "@/lib/types";

interface DealershipRow {
  id: string;
  slug: string;
  name: string;
  brand: string;
  location: string | null;
  billing_terms: number;
  active: boolean;
  hide_cost_from_users: boolean;
}

// WGA admin: dealerships, their logins, passwords and visibility settings.
export default function WgaDealershipsPage() {
  const { session, ready } = useWgaSession();
  const [dealerships, setDealerships] = useState<DealershipRow[]>([]);
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState<null | { kind: "user"; dealership: DealershipRow } | { kind: "pw"; user: DealerUser } | { kind: "dpw"; dealership: DealershipRow }>(null);

  async function load() {
    const r = await fetch("/api/wga/dealerships");
    if (r.ok) {
      const d = await r.json();
      setDealerships(d.dealerships || []);
      setUsers(d.users || []);
    }
  }
  useEffect(() => {
    if (ready) load();
  }, [ready]);

  async function act(body: any) {
    setMsg("");
    const r = await fetch("/api/wga/dealerships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed");
    await load();
  }

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  if (session.user.role !== "admin") {
    return <div className="frame"><WgaHeader userName={session.user.name} role={session.user.role} /><main><div className="stage"><div className="notice warn">Admins only.</div></div></main></div>;
  }

  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} />
      <main>
        <div className="stage" style={{ maxWidth: 1180 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">DEALERSHIPS</div>
            <div className="stage-title">Who's on the program.</div>
            <div className="stage-sub">Each dealership has its own logins. Dealer admins can set their own retail, hide our cost from their sales team, and manage their people. Sales users quote and submit orders.</div>
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}

          {dealerships.map((d) => {
            const du = users.filter((u) => u.dealership_id === d.id);
            return (
              <div key={d.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ marginBottom: 2 }}>{d.name}</h3>
                    <div style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.1em" }}>{d.location} · slug <b style={{ color: "var(--text-2)" }}>{d.slug}</b> · net {d.billing_terms}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: "dpw", dealership: d })}>Shared password</button>
                    <button className="btn-primary btn-sm" onClick={() => setModal({ kind: "user", dealership: d })}>+ Add login</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "16px 0" }}>
                  <label className="check"><input type="checkbox" checked={d.active} onChange={(e) => act({ action: "dealership.update", id: d.id, active: e.target.checked }).catch((er) => setMsg(er.message))} /> Active</label>
                  <label className="check"><input type="checkbox" checked={d.hide_cost_from_users} onChange={(e) => act({ action: "dealership.update", id: d.id, hide_cost_from_users: e.target.checked }).catch((er) => setMsg(er.message))} /> Hide WGA cost from their sales users</label>
                </div>
                <div className="tbl-wrap">
                  <table className="tbl" style={{ minWidth: 600 }}>
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
                    <tbody>
                      {du.length === 0 ? <tr><td colSpan={6} style={{ textAlign: "center" }}>No logins yet — the shared dealership password still works and signs in as an admin.</td></tr> : null}
                      {du.map((u) => (
                        <tr key={u.id}>
                          <td><b>{u.name}</b></td>
                          <td>{u.email}</td>
                          <td>
                            <select value={u.role} onChange={(e) => act({ action: "user.update", id: u.id, role: e.target.value }).catch((er) => setMsg(er.message))}>
                              <option value="user">Sales</option>
                              <option value="admin">Dealer admin</option>
                            </select>
                          </td>
                          <td><span className={"status-pill " + (u.active ? "scheduled" : "cancelled")}>{u.active ? "Active" : "Disabled"}</span></td>
                          <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "Never"}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button className="link-btn" onClick={() => setModal({ kind: "pw", user: u })}>Reset password</button>
                            <button className="link-btn danger" onClick={() => act({ action: "user.update", id: u.id, active: !u.active }).catch((er) => setMsg(er.message))}>{u.active ? "Disable" : "Enable"}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      {modal ? <Modal modal={modal} onClose={() => setModal(null)} act={act} /> : null}
    </div>
  );
}

function Modal({ modal, onClose, act }: { modal: any; onClose: () => void; act: (b: any) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const title = modal.kind === "user" ? `Add login · ${modal.dealership.name}` : modal.kind === "pw" ? `Reset password · ${modal.user.name}` : `Shared password · ${modal.dealership.name}`;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (modal.kind === "user") await act({ action: "user.create", dealership_id: modal.dealership.id, name, email, role, password });
      else if (modal.kind === "pw") await act({ action: "user.password", id: modal.user.id, password });
      else await act({ action: "dealership.password", id: modal.dealership.id, password });
      onClose();
    } catch (er: any) {
      setErr(er.message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={go}>
        <h3>{title}</h3>
        {modal.kind === "user" ? (
          <div style={{ display: "grid", gap: 14 }}>
            <div className="field"><label htmlFor="n">Name</label><input id="n" value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="field"><label htmlFor="e">Email</label><input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="field"><label htmlFor="r">Role</label><select id="r" value={role} onChange={(e) => setRole(e.target.value)}><option value="user">Sales — quotes and orders</option><option value="admin">Dealer admin — pricing, team, settings</option></select></div>
          </div>
        ) : null}
        <div className="field" style={{ marginTop: 14 }}><label htmlFor="p">{modal.kind === "dpw" ? "New shared password" : "Temporary password"} (8+ characters)</label><input id="p" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
        {modal.kind !== "dpw" ? <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10 }}>They'll choose their own password at first sign-in.</p> : null}
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
