"use client";

import { useState } from "react";
import type { DealerUser } from "@/lib/types";

// Per-person access, invites and logins for a dealership (dealer admins).
// Used on Settings → Team and in the first-time setup wizard.

export type Access = { see_cost: boolean; see_all_orders: boolean; master_sheet: boolean; comebacks: boolean };
export type AccessQuestion = { key: keyof Access; label: string; question: string; help: string };
export interface AccessSnapshot {
  questions: AccessQuestion[];
  defaults: Access;
  overrides: Record<string, Partial<Access>>;
  resolved: Record<string, Access>;
  profiles: Record<string, { title?: string; phone?: string }>;
  setup: { done: boolean; at?: string; by?: string };
  notify: { users: Record<string, string>; extra: string[] };
  emailConfigured: boolean;
}

// One yes/no question per row. `value` is the effective access; `onChange` gets the single key flipped.
export function AccessToggles({ questions, value, onChange, big = false, disabled = false }: { questions: AccessQuestion[]; value: Access; onChange: (key: keyof Access, v: boolean) => void; big?: boolean; disabled?: boolean }) {
  return (
    <div className={"access-list" + (big ? " big" : "")}>
      {questions.map((q) => (
        <div key={q.key} className="access-row">
          <div className="access-text">
            <div className="access-q">{big ? q.question : q.label}</div>
            {big ? <div className="access-help">{q.help}</div> : null}
          </div>
          <div className="yesno" role="radiogroup" aria-label={q.label}>
            <button type="button" role="radio" aria-checked={value[q.key]} className={value[q.key] ? "on" : ""} disabled={disabled} onClick={() => onChange(q.key, true)}>Yes</button>
            <button type="button" role="radio" aria-checked={!value[q.key]} className={!value[q.key] ? "on" : ""} disabled={disabled} onClick={() => onChange(q.key, false)}>No</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// The sign-in link for someone you invited: copy it, text it, or share it.
export function InviteLink({ name, link, emailed, onClose }: { name: string; link: string; emailed?: boolean; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  const first = name.split(" ")[0];
  const text = `${first}, here's your login for our White Glove Auto dealer portal — tap to set your password: ${link}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", link);
    }
  }
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Dealer portal login", text });
      else window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
    } catch {}
  }
  return (
    <div className="invite-link">
      <div className="invite-head">
        <b>{emailed ? `Invite emailed to ${first}.` : `${first}'s sign-in link is ready.`}</b>
        {onClose ? <button type="button" className="link-btn" onClick={onClose}>done</button> : null}
      </div>
      <div className="invite-sub">{emailed ? "You can also text it to them:" : "Send it to them — it works once and is good for 7 days:"}</div>
      <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Sign-in link" />
      <div className="invite-actions">
        <button type="button" className="btn-primary btn-sm" onClick={share}>Text / share</button>
        <button type="button" className="btn-ghost btn-sm" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
      </div>
    </div>
  );
}

async function post(url: string, body: any, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong.");
  return d;
}

// Invite form: name, email, admin or sales, and (for sales) what they can see.
export function InviteForm({ snap, onInvited, compact = false }: { snap: AccessSnapshot; onInvited: (r: { user: DealerUser; link: string; emailed: boolean }) => void; compact?: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [custom, setCustom] = useState<Access | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const access = custom || snap.defaults;
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const d = await post("/api/dealer/users", { action: "invite", name, email, role, access: role === "user" && custom ? custom : undefined });
      onInvited(d);
      setName("");
      setEmail("");
      setRole("user");
      setCustom(null);
    } catch (er: any) {
      setErr(er.message);
    }
    setBusy(false);
  }
  return (
    <form className={"invite-form" + (compact ? " compact" : "")} onSubmit={go}>
      <div className="invite-grid">
        <div className="field"><label htmlFor="inv-name">Name</label><input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Smith" autoComplete="off" required /></div>
        <div className="field"><label htmlFor="inv-email">Email</label><input id="inv-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@dealership.com" autoComplete="off" required /></div>
        <div className="field"><label htmlFor="inv-role">They are</label>
          <select id="inv-role" value={role} onChange={(e) => setRole(e.target.value as any)}>
            <option value="user">Sales — quotes &amp; orders</option>
            <option value="admin">Admin — everything, incl. pricing &amp; team</option>
          </select>
        </div>
      </div>
      {role === "user" ? (
        <details className="invite-access" open={!!custom}>
          <summary onClick={(e) => { e.preventDefault(); setCustom(custom ? null : { ...snap.defaults }); }}>{custom ? "Custom access for this person ▾" : "Uses your team defaults · customize ▸"}</summary>
          {custom ? <AccessToggles questions={snap.questions} value={access} onChange={(k, v) => setCustom({ ...access, [k]: v })} /> : null}
        </details>
      ) : null}
      {err ? <div className="err">{err}</div> : null}
      <button type="submit" className="btn-primary btn-sm" disabled={busy}>{busy ? "Inviting…" : "Invite"}</button>
    </form>
  );
}

// Everyone at the dealership, each with their own access, email level and login actions.
export default function TeamManager({ users, snap, meId, onChanged, onSetPassword }: { users: DealerUser[]; snap: AccessSnapshot; meId?: string | null; onChanged: () => Promise<void>; onSetPassword?: (u: DealerUser) => void }) {
  const [msg, setMsg] = useState("");
  const [links, setLinks] = useState<Record<string, { link: string; emailed: boolean }>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const run = async (fn: () => Promise<any>) => {
    setMsg("");
    try {
      await fn();
      await onChanged();
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  const setAccess = (id: string, k: keyof Access, v: boolean) => run(() => post("/api/dealer/access", { users: { [id]: { [k]: v } } }, "PUT"));
  const resetAccess = (id: string) => run(() => post("/api/dealer/access", { users: { [id]: null } }, "PUT"));
  const setNotify = (id: string, lvl: string) => run(() => post("/api/dealer/access", { notify: { users: { [id]: lvl } } }, "PUT"));
  const update = (b: any) => run(() => post("/api/dealer/users", { action: "update", ...b }));
  async function newLink(u: DealerUser) {
    setMsg("");
    try {
      const d = await post("/api/dealer/users", { action: "link", id: u.id, email: true });
      setLinks((l) => ({ ...l, [u.id]: { link: d.link, emailed: d.emailed } }));
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <div className="team">
      <div className="toolbar">
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{users.length} {users.length === 1 ? "person" : "people"} · access is per person</span>
        <span className="grow" />
        <button className="btn-primary btn-sm" onClick={() => setInviteOpen((v) => !v)}>{inviteOpen ? "Close" : "+ Invite someone"}</button>
      </div>
      {inviteOpen ? (
        <div className="card">
          <h3>Invite someone</h3>
          <p style={{ marginBottom: 14 }}>They get a link to set their own password{snap.emailConfigured ? " by email, and you can text it too" : " — text or send it to them"}.</p>
          <InviteForm snap={snap} onInvited={async (r) => { setLinks((l) => ({ ...l, [r.user.id]: { link: r.link, emailed: r.emailed } })); setOpen((o) => ({ ...o, [r.user.id]: true })); setInviteOpen(false); await onChanged(); }} />
        </div>
      ) : null}
      {msg ? <div className="notice warn">{msg}</div> : null}
      <div className="team-grid">
        {users.map((u) => {
          const acc = snap.resolved[u.id] || snap.defaults;
          const custom = !!snap.overrides[u.id] && Object.keys(snap.overrides[u.id]).length > 0;
          const isMe = u.id === meId;
          const pending = !u.last_login_at;
          return (
            <div key={u.id} className={"card person" + (u.active ? "" : " off")}>
              <div className="person-head">
                <div>
                  <b>{u.name}</b>{isMe ? <span className="you">you</span> : null}
                  <div className="person-sub">{u.email}</div>
                </div>
                <span className={"status-pill " + (!u.active ? "cancelled" : pending ? "new" : "scheduled")}>{!u.active ? "Disabled" : pending ? "Invited" : "Active"}</span>
              </div>
              <div className="person-row">
                <div className="field"><label>Role</label>
                  <select value={u.role} disabled={isMe} onChange={(e) => update({ id: u.id, role: e.target.value })}>
                    <option value="user">Sales</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="field"><label>Update emails</label>
                  <select value={snap.notify.users[u.id] || "mine"} onChange={(e) => setNotify(u.id, e.target.value)}>
                    <option value="mine">Their orders</option>
                    <option value="all">Every order</option>
                    <option value="off">Off</option>
                  </select>
                </div>
              </div>
              {u.role === "admin" ? (
                <div className="person-note">Admins see and do everything — cost, every order, pricing, team and settings.</div>
              ) : (
                <>
                  <button type="button" className="access-toggle" onClick={() => setOpen((o) => ({ ...o, [u.id]: !o[u.id] }))}>
                    <span>What {u.name.split(" ")[0]} can see{custom ? " · custom" : " · team defaults"}</span>
                    <span>{open[u.id] ? "▴" : "▾"}</span>
                  </button>
                  {open[u.id] ? (
                    <div className="person-access">
                      <AccessToggles questions={snap.questions} value={acc} onChange={(k, v) => setAccess(u.id, k, v)} />
                      {custom ? <button type="button" className="link-btn" onClick={() => resetAccess(u.id)}>Go back to team defaults</button> : null}
                    </div>
                  ) : (
                    <div className="person-chips">
                      {snap.questions.map((q) => <span key={q.key} className={"chip-mini" + (acc[q.key] ? " yes" : "")}>{acc[q.key] ? "✓" : "✕"} {q.label}</span>)}
                    </div>
                  )}
                </>
              )}
              {links[u.id] ? <InviteLink name={u.name} link={links[u.id].link} emailed={links[u.id].emailed} onClose={() => setLinks((l) => { const n = { ...l }; delete n[u.id]; return n; })} /> : null}
              <div className="person-actions">
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{u.last_login_at ? `Last in ${new Date(u.last_login_at).toLocaleDateString()}` : "Hasn't signed in yet"}</span>
                <span className="grow" />
                {!isMe ? <button type="button" className="link-btn" onClick={() => newLink(u)}>{pending ? "Resend invite" : "Send sign-in link"}</button> : null}
                {onSetPassword && !isMe ? <button type="button" className="link-btn" onClick={() => onSetPassword(u)}>Set password</button> : null}
                {!isMe ? <button type="button" className="link-btn danger" onClick={() => { if (u.active && !confirm(`Disable ${u.name}'s login? They're signed out right away.`)) return; update({ id: u.id, active: !u.active }); }}>{u.active ? "Disable" : "Enable"}</button> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
