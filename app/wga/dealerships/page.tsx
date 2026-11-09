"use client";

import { useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import { hasPerm } from "@/lib/perms";
import { useWgaSession } from "@/lib/useDealerSession";
import type { DealerUser } from "@/lib/types";

interface DealershipRow {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  brand: string;
  brand_key: string | null;
  hostnames: string[] | null;
  logo_url: string | null;
  location: string | null;
  billing_terms: number;
  active: boolean;
  hide_cost_from_users: boolean;
}
interface BrandRow { key: string; name: string; make: string; logo_light_url: string; theme: Record<string, string>; tagline: string | null }

// WGA admin: dealerships, their logins, passwords and visibility settings.
export default function WgaDealershipsPage() {
  const { session, ready } = useWgaSession();
  const [dealerships, setDealerships] = useState<DealershipRow[]>([]);
  const [users, setUsers] = useState<DealerUser[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [msg, setMsg] = useState("");
  const [modal, setModal] = useState<null | { kind: "user"; dealership: DealershipRow } | { kind: "pw"; user: DealerUser } | { kind: "dpw"; dealership: DealershipRow } | { kind: "new" } | { kind: "brand"; brand?: BrandRow }>(null);

  async function load() {
    const r = await fetch("/api/wga/dealerships");
    if (r.ok) {
      const d = await r.json();
      setDealerships(d.dealerships || []);
      setUsers(d.users || []);
      setBrands(d.brands || []);
    }
  }
  useEffect(() => {
    if (ready) load();
  }, [ready]);

  async function viewAs(dealership_id: string, role: "admin" | "user") {
    setMsg("");
    const r = await fetch("/api/wga/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dealership_id, role }) });
    const d = await r.json();
    if (!r.ok) {
      setMsg(d.error || "Could not open dealer view.");
      return;
    }
    window.open(d.next, "_blank");
  }

  async function act(body: any) {
    setMsg("");
    const r = await fetch("/api/wga/dealerships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed");
    await load();
  }

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  if (!hasPerm(session.user, "dealerships")) {
    return <div className="frame"><WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} /><main><div className="stage"><div className="notice warn">You don&apos;t have access to this area. Ask an admin on the Team page.</div></div></main></div>;
  }

  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} />
      <main>
        <div className="stage" style={{ maxWidth: 1180 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">DEALERSHIPS</div>
            <div className="stage-title">Who's on the program.</div>
            <div className="stage-sub">Each dealership has its own logins, its own subdomain and its manufacturer&apos;s look. Dealer admins can set their own retail, hide our cost from their sales team, and manage their people. Sales users quote and submit orders.</div>
          </div>
          <div className="toolbar" style={{ marginBottom: 18 }}>
            <button className="btn-primary btn-sm" onClick={() => setModal({ kind: "new" })}>+ Add dealership</button>
            <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: "brand" })}>+ Add brand</button>
            <span className="grow" />
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}

          {dealerships.map((d) => {
            const du = users.filter((u) => u.dealership_id === d.id);
            return (
              <div key={d.id} className="card" style={{ opacity: d.active ? 1 : 0.6, borderColor: d.active ? undefined : "var(--warn)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ marginBottom: 2 }}>{d.name}{d.active ? null : <span className="status-pill cancelled" style={{ marginLeft: 10, verticalAlign: "middle" }}>Inactive — logins blocked</span>}</h3>
                    <div style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.1em" }}>{d.location} · {d.brand} · slug <b style={{ color: "var(--text-2)" }}>{d.slug}</b> · net {d.billing_terms}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Portal: {(d.hostnames || []).length ? (d.hostnames || []).map((h) => <a key={h} href={`https://${h}`} target="_blank" rel="noreferrer" style={{ color: "var(--gold)", marginRight: 10 }}>{h}</a>) : <span>no hostname yet</span>}
                      <button className="link-btn" onClick={() => { const v = prompt("Hostnames for this dealership (comma separated):", (d.hostnames || []).join(", ")); if (v !== null) act({ action: "dealership.update", id: d.id, hostnames: v }).catch((er) => setMsg(er.message)); }}>edit</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn-ghost btn-sm" title="Open the dealer portal exactly as their admin sees it" onClick={() => viewAs(d.id, "admin")}>View as dealer admin</button>
                    <button className="btn-ghost btn-sm" title="Open the dealer portal exactly as a sales user sees it (cost hidden if they've turned that on)" onClick={() => viewAs(d.id, "user")}>View as sales user</button>
                    <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: "dpw", dealership: d })}>Shared password</button>
                    <button className="btn-primary btn-sm" onClick={() => setModal({ kind: "user", dealership: d })}>+ Add login</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "16px 0" }}>
                  <label className="check"><input type="checkbox" checked={d.active} onChange={(e) => { if (!e.target.checked && !confirm(`Deactivate ${d.name}? Every one of their logins stops working immediately and their portal link goes dark until you turn it back on.`)) { e.preventDefault(); return; } act({ action: "dealership.update", id: d.id, active: e.target.checked }).catch((er) => setMsg(er.message)); }} /> Active</label>
                  <label className="check"><input type="checkbox" checked={d.hide_cost_from_users} onChange={(e) => act({ action: "dealership.update", id: d.id, hide_cost_from_users: e.target.checked }).catch((er) => setMsg(er.message))} /> Hide WGA cost from their sales users</label>
                </div>
                {/* Phones: one card per login */}
                <div className="user-cards">
                  {du.length === 0 ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>No logins yet — the shared dealership password still works and signs in as an admin.</div> : null}
                  {du.map((u) => (
                    <div key={u.id} className="user-card">
                      <div className="uc-top">
                        <b>{u.name}</b>
                        <span className={"status-pill " + (u.active ? "scheduled" : "cancelled")}>{u.active ? "Active" : "Disabled"}</span>
                      </div>
                      <div className="uc-email">{u.email}</div>
                      <div className="uc-meta">Last sign-in {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "never"}</div>
                      <div className="uc-actions">
                        <select value={u.role} onChange={(e) => act({ action: "user.update", id: u.id, role: e.target.value }).catch((er) => setMsg(er.message))}>
                          <option value="user">Sales</option>
                          <option value="admin">Dealer admin</option>
                        </select>
                        <button className="btn-ghost btn-sm" onClick={() => setModal({ kind: "pw", user: u })}>Reset password</button>
                        <button className="btn-ghost btn-sm" onClick={() => act({ action: "user.update", id: u.id, active: !u.active }).catch((er) => setMsg(er.message))}>{u.active ? "Disable" : "Enable"}</button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="tbl-wrap desktop-only">
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

          <div className="stage-head" style={{ marginTop: 36, marginBottom: 12 }}>
            <div className="stage-eyebrow">BRANDS</div>
            <div className="stage-title" style={{ fontSize: 28 }}>Manufacturer looks.</div>
            <div className="stage-sub">A brand is the badge, colors and fonts a dealership&apos;s portal wears, plus its catalog of services and packages. Add one per manufacturer; dealerships pick from the list.</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {brands.map((b) => (
              <div key={b.key} className="card" style={{ margin: 0, cursor: "pointer" }} onClick={() => setModal({ kind: "brand", brand: b })}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div data-theme-exempt style={{ width: 56, height: 40, background: b.theme?.bg || "#111", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${b.theme?.stroke || "#333"}` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.logo_light_url} alt={b.name} style={{ maxHeight: 28, maxWidth: 48, objectFit: "contain" }} />
                  </div>
                  <div>
                    <b>{b.name}</b>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>{b.key} · {dealerships.filter((d) => d.brand_key === b.key).length} dealership(s)</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
                  {["bg", "surface", "accent", "accentBright", "text"].map((k) => <span key={k} title={k} data-theme-exempt style={{ width: 22, height: 14, background: b.theme?.[k] || "#000", border: "1px solid rgba(255,255,255,0.15)" }} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
      {modal ? <Modal modal={modal} onClose={() => setModal(null)} act={act} brands={brands} dealerships={dealerships} reload={load} /> : null}
    </div>
  );
}

function Modal({ modal, onClose, act, brands, dealerships, reload }: { modal: any; onClose: () => void; act: (b: any) => Promise<void>; brands: BrandRow[]; dealerships: DealershipRow[]; reload: () => Promise<void> }) {
  if (modal.kind === "new") return <NewDealershipModal onClose={onClose} act={act} brands={brands} dealerships={dealerships} />;
  if (modal.kind === "brand") return <BrandModal onClose={onClose} brand={modal.brand} brands={brands} reload={reload} />;
  return <AccountModal modal={modal} onClose={onClose} act={act} />;
}

function AccountModal({ modal, onClose, act }: { modal: any; onClose: () => void; act: (b: any) => Promise<void> }) {
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

const inputStyle = { width: "100%", background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)", padding: "10px 12px", fontFamily: "inherit", fontSize: 13 } as const;

function NewDealershipModal({ onClose, act, brands, dealerships }: { onClose: () => void; act: (b: any) => Promise<void>; brands: BrandRow[]; dealerships: DealershipRow[] }) {
  const [f, setF] = useState<any>({ name: "", slug: "", short_name: "", brand_key: brands[0]?.key || "", location: "", hostnames: "", billing_terms: 30, copy_pricing_from: "", admin_name: "", admin_email: "", admin_password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const siblings = dealerships.filter((d) => d.brand_key === f.brand_key);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await act({ action: "dealership.create", ...f });
      onClose();
    } catch (er: any) {
      setErr(er.message);
      setBusy(false);
    }
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={go} style={{ maxWidth: 560 }}>
        <h3>Add dealership</h3>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Dealership name</label><input value={f.name} onChange={(e) => { set("name", e.target.value); if (!f.slug) set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")); }} required placeholder="BMW of Tulsa" /></div>
          <div className="field"><label>Slug</label><input value={f.slug} onChange={(e) => set("slug", e.target.value)} required placeholder="bmw-tulsa" /></div>
          <div className="field"><label>Short name</label><input value={f.short_name} onChange={(e) => set("short_name", e.target.value)} placeholder="BMW Tulsa" /></div>
          <div className="field"><label>Brand</label><select value={f.brand_key} onChange={(e) => set("brand_key", e.target.value)} required>{brands.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select></div>
          <div className="field"><label>Location</label><input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Tulsa, Oklahoma" /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Portal hostname(s)</label><input value={f.hostnames} onChange={(e) => set("hostnames", e.target.value)} placeholder="bmw.whitegloveauto.app" /><p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>Add the same subdomain in Netlify (Domain management → add domain alias). DNS for *.whitegloveauto.app should already point at Netlify.</p></div>
          <div className="field"><label>Billing terms (net days)</label><input type="number" value={f.billing_terms} onChange={(e) => set("billing_terms", Number(e.target.value))} /></div>
          <div className="field"><label>Copy pricing from</label><select value={f.copy_pricing_from} onChange={(e) => set("copy_pricing_from", e.target.value)}><option value="">Start empty</option>{siblings.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div style={{ gridColumn: "1 / -1", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)", marginTop: 6 }}>First dealer admin login (optional)</div>
          <div className="field"><label>Name</label><input value={f.admin_name} onChange={(e) => set("admin_name", e.target.value)} /></div>
          <div className="field"><label>Email</label><input type="email" value={f.admin_email} onChange={(e) => set("admin_email", e.target.value)} /></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>Temporary password (8+)</label><input value={f.admin_password} onChange={(e) => set("admin_password", e.target.value)} /></div>
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>{busy ? "Creating…" : "Create dealership"}</button>
        </div>
      </form>
    </div>
  );
}

const THEME_FIELDS: [string, string][] = [["bg", "Background"], ["surface", "Panels"], ["stroke", "Lines"], ["text", "Text"], ["text2", "Muted text"], ["accent", "Accent"], ["accentBright", "Accent bright"], ["accentDim", "Accent dim"]];

function BrandModal({ onClose, brand, brands, reload }: { onClose: () => void; brand?: BrandRow; brands: BrandRow[]; reload: () => Promise<void> }) {
  const [f, setF] = useState<any>({ key: brand?.key || "", name: brand?.name || "", make: brand?.make || "", tagline: brand?.tagline || "", copy_catalog_from: brands[0]?.key || "", theme: { ...(brand?.theme || {}) } });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const setT = (k: string, v: string) => setF((x: any) => ({ ...x, theme: { ...x.theme, [k]: v } }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/wga/brands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json();
    if (!r.ok) {
      setErr(d.error || "Failed");
      setBusy(false);
      return;
    }
    await reload();
    onClose();
  }
  async function upload(file: File) {
    const fd = new FormData();
    fd.append("key", f.key);
    fd.append("file", file);
    const r = await fetch("/api/wga/brands", { method: "POST", body: fd });
    if (!r.ok) setErr((await r.json()).error || "Upload failed");
    else await reload();
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={save} style={{ maxWidth: 620 }}>
        <h3>{brand ? `Brand · ${brand.name}` : "Add brand"}</h3>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <div className="field"><label>Name (as shown)</label><input value={f.name} onChange={(e) => { set("name", e.target.value); if (!brand) set("key", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")); if (!f.make) set("make", e.target.value); }} required placeholder="BMW" /></div>
          <div className="field"><label>Key</label><input value={f.key} onChange={(e) => set("key", e.target.value)} required disabled={!!brand} placeholder="bmw" /></div>
          <div className="field"><label>Make (on vehicles / ShopMonkey)</label><input value={f.make} onChange={(e) => set("make", e.target.value)} placeholder="BMW" /></div>
          <div className="field"><label>Tagline</label><input value={f.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Authorized dealership pricing portal" /></div>
          {!brand ? <div className="field" style={{ gridColumn: "1 / -1" }}><label>Copy services &amp; packages from</label><select value={f.copy_catalog_from} onChange={(e) => set("copy_catalog_from", e.target.value)}><option value="">Start empty</option>{brands.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}</select></div> : null}
          {brand ? (
            <div className="field" style={{ gridColumn: "1 / -1" }}><label>Badge / logo</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div data-theme-exempt style={{ background: f.theme.bg || "#111", padding: 8, border: "1px solid var(--stroke)" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={brand.logo_light_url} alt="" style={{ height: 32, maxWidth: 120, objectFit: "contain" }} /></div>
                <label className="btn-ghost btn-sm" style={{ cursor: "pointer" }}>Upload badge<input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
              </div>
            </div>
          ) : null}
          <div style={{ gridColumn: "1 / -1", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)", marginTop: 6 }}>Colors</div>
          {THEME_FIELDS.map(([k, label]) => (
            <div key={k} className="field"><label>{label}</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={f.theme[k] || "#000000"} onChange={(e) => setT(k, e.target.value)} style={{ width: 42, height: 36, padding: 2, background: "var(--bg)", border: "1px solid var(--stroke)" }} />
                <input value={f.theme[k] || ""} onChange={(e) => setT(k, e.target.value)} placeholder="#000000" style={{ ...inputStyle, flex: 1 }} />
              </div>
            </div>
          ))}
          <div className="field"><label>Display font (Google Fonts name)</label><input value={f.theme.displayFont || ""} onChange={(e) => setT("displayFont", e.target.value)} placeholder="Cormorant Garamond" /></div>
          <div className="field"><label>Body font</label><input value={f.theme.bodyFont || ""} onChange={(e) => setT("bodyFont", e.target.value)} placeholder="Inter" /></div>
        </div>
        <div className="err">{err}</div>
        <div className="actions">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary btn-sm" disabled={busy}>{busy ? "Saving…" : "Save brand"}</button>
        </div>
      </form>
    </div>
  );
}
