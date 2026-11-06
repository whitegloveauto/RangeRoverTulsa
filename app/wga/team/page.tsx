"use client";

import { useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import { useWgaSession } from "@/lib/useDealerSession";
import { PERMS } from "@/lib/perms";

interface Member { id: string; email: string; name: string; isAdmin: boolean; hasAccess: boolean; perms: string[]; last_login_at: string | null }

// Admin: who at White Glove Auto can see what on this side.
export default function TeamPage() {
  const { session, ready } = useWgaSession();
  const [team, setTeam] = useState<Member[]>([]);
  const [msg, setMsg] = useState("");
  const [showAll, setShowAll] = useState(false);

  async function load() {
    const r = await fetch("/api/wga/team");
    if (r.ok) setTeam((await r.json()).team || []);
  }
  useEffect(() => {
    if (ready) load();
  }, [ready]);

  async function setPerms(m: Member, perms: string[]) {
    setMsg("");
    setTeam((t) => t.map((x) => (x.id === m.id ? { ...x, perms, hasAccess: perms.length > 0 } : x)));
    const r = await fetch("/api/wga/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: m.id, perms }) });
    if (!r.ok) {
      setMsg((await r.json()).error || "Could not save");
      load();
    }
  }
  const toggle = (m: Member, key: string) => setPerms(m, m.perms.includes(key) ? m.perms.filter((p) => p !== key) : [...m.perms, key]);
  const editable = PERMS.filter((p) => p.key !== "team");

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  if (session.user.role !== "admin") return <div className="frame"><WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} /><main><div className="stage"><div className="notice warn">Admins only.</div></div></main></div>;

  const shown = team.filter((m) => showAll || m.hasAccess);
  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} />
      <main>
        <div className="stage" style={{ maxWidth: 1100 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">TEAM</div>
            <div className="stage-title">Who sees what.</div>
            <div className="stage-sub">Everyone with a White Glove Auto login is listed. Tick what each person can open on this side; it applies on their next click. Admins always have everything. &quot;Orders&quot; or &quot;Comebacks&quot; also turns on their dealer-order push alerts in the app.</div>
          </div>
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show everyone, including people with no access yet</label>
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}

          <div className="order-cards" style={{ display: "flex" }}>
            {shown.map((m) => (
              <div key={m.id} className="order-card" style={{ borderColor: m.hasAccess ? "var(--stroke)" : "var(--stroke-soft)", opacity: m.hasAccess || showAll ? 1 : 0.6 }}>
                <div className="oc-top">
                  <span><b>{m.name}</b> <span style={{ color: "var(--text-3)", fontSize: 12 }}>· {m.email}</span></span>
                  {m.isAdmin ? <span className="status-pill scheduled">Admin · everything</span> : m.hasAccess ? <span className="status-pill complete">{m.perms.length} area{m.perms.length === 1 ? "" : "s"}</span> : <span className="status-pill cancelled">No access</span>}
                </div>
                {m.isAdmin ? null : (
                  <div className="perm-grid">
                    {editable.map((p) => (
                      <label key={p.key} className={"perm " + (m.perms.includes(p.key) ? "on" : "")} title={p.help}>
                        <input type="checkbox" checked={m.perms.includes(p.key)} onChange={() => toggle(m, p.key)} />
                        <span>{p.label}</span>
                        <small>{p.help}</small>
                      </label>
                    ))}
                  </div>
                )}
                {!m.isAdmin ? (
                  <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 11 }}>
                    <button className="link-btn" onClick={() => setPerms(m, editable.map((p) => p.key))}>Everything (except Team)</button>
                    <button className="link-btn" onClick={() => setPerms(m, ["orders", "comebacks"])}>Shop only</button>
                    <button className="link-btn danger" onClick={() => setPerms(m, [])}>Remove access</button>
                  </div>
                ) : null}
                <div className="oc-meta" style={{ marginTop: 8 }}><span>Last sign-in {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : "never"}</span></div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
