"use client";

import { Fragment, useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import { useWgaSession } from "@/lib/useDealerSession";

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const STATUSES = [
  ["new", "New"],
  ["in_shopmonkey", "In ShopMonkey"],
  ["scheduled", "Scheduled"],
  ["in_progress", "In progress"],
  ["complete", "Complete"],
  ["cancelled", "Cancelled"],
] as const;

export default function WgaOrdersPage() {
  const { session, ready } = useWgaSession();
  const [filter, setFilter] = useState("new");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function load(f = filter) {
    const r = await fetch("/api/wga/orders?status=" + f);
    if (r.ok) setRows((await r.json()).orders || []);
  }
  useEffect(() => {
    if (ready) load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filter]);

  async function patch(id: string, body: any) {
    setMsg("");
    const r = await fetch("/api/wga/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    if (!r.ok) setMsg((await r.json()).error || "Update failed");
    await load();
  }

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;

  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} />
      <main>
        <div className="stage" style={{ maxWidth: 1240 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">DEALER ORDERS</div>
            <div className="stage-title">Work coming in.</div>
            <div className="stage-sub">Orders submitted from the dealership portal. Move each one through ShopMonkey → scheduled → complete. Trim is on every order so patterns get cut for the right variant.</div>
          </div>
          <div className="tabs">
            {[["new", "New"], ["in_shopmonkey", "In ShopMonkey"], ["scheduled", "Scheduled"], ["in_progress", "In progress"], ["complete", "Complete"], ["all", "All"]].map(([k, l]) => (
              <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Submitted</th><th>Quote #</th><th>RO #</th><th>Dealership</th><th>Vehicle</th><th>Services</th><th>Status</th><th>Assigned</th><th style={{ textAlign: "right" }}>WGA bills</th><th style={{ textAlign: "right" }}>Dealer retail</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={10} style={{ textAlign: "center", padding: 28 }}>Nothing here.</td></tr> : null}
                {rows.map((o) => (
                  <OrderRow key={o.id} o={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} onPatch={(b) => patch(o.id, b)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function OrderRow({ o, open, onToggle, onPatch }: { o: any; open: boolean; onToggle: () => void; onPatch: (b: any) => Promise<void> }) {
  const lines: any[] = o.line_items?.length ? o.line_items : [...(o.package_snapshot?.items || []), ...(o.alacarte_items || [])];
  const when = o.submitted_at || o.created_at;
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <td>{new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })}<br /><span style={{ fontSize: 11 }}>{new Date(when).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span></td>
        <td><b>{o.quote_number}</b></td>
        <td>{o.sm_order_number ? <b style={{ color: "var(--gold-bright)" }}>RO {o.sm_order_number}</b> : o.sm_sync_error ? <span className="status-pill cancelled" title={o.sm_sync_error}>SM failed</span> : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
        <td>{o.dealer_dealerships?.name || "—"}<br /><span style={{ fontSize: 11 }}>{o.dealer_user_name || ""}</span></td>
        <td><b>{o.vehicle_year} {o.vehicle_model}</b><br /><span style={{ fontSize: 11, color: "var(--gold-bright)" }}>{o.vehicle_trim}</span></td>
        <td>{lines.map((l) => l.name).join(", ")}</td>
        <td><span className={"status-pill " + o.status}>{(STATUSES.find((s) => s[0] === o.status) || [o.status, o.status])[1]}</span>{o.scheduled_date ? <div style={{ fontSize: 11, marginTop: 4 }}>{o.scheduled_date}</div> : null}</td>
        <td>{o.assigned_name || "—"}</td>
        <td className="num"><b>{money(o.cost_total)}</b></td>
        <td className="num">{money(o.retail_total)}</td>
      </tr>
      {open ? (
        <tr className="detail-row">
          <td colSpan={10}>
            <div className="detail-lines">
              <span className="h">Line item</span><span className="h r">WGA bills</span><span className="h r">Dealer retail</span>
              {lines.map((l, i) => (
                <Fragment key={i}>
                  <span>{l.service ? <span style={{ color: "var(--text-3)" }}>{l.service} · </span> : null}{l.name}</span>
                  <span className="r">{money(l.cost)}</span>
                  <span className="r">{money(l.retail)}</span>
                </Fragment>
              ))}
            </div>
            <div className="detail-meta">
              {o.vehicle_vin ? <span>VIN <b>{o.vehicle_vin}</b></span> : null}
              {o.stock_number ? <span>Stock <b>{o.stock_number}</b></span> : null}
              {o.customer_name ? <span>Customer <b>{o.customer_name}</b>{o.customer_phone ? ` · ${o.customer_phone}` : ""}</span> : null}
              {o.notes ? <span>Dealer notes <b>{o.notes}</b></span> : null}
              {o.sm_order_number ? <span>ShopMonkey <b>RO {o.sm_order_number}</b>{o.sm_synced_at ? ` · ${new Date(o.sm_synced_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</span> : null}
              {!o.sm_order_number ? (
                <span onClick={(e) => e.stopPropagation()}>
                  ShopMonkey <b style={{ color: o.sm_sync_error ? "#e06b6b" : undefined }}>{o.sm_sync_error ? `failed — ${o.sm_sync_error}` : "no RO yet"}</b>{" "}
                  <button className="link-btn" onClick={() => onPatch({ action: "shopmonkey" })}>Create RO now</button>
                </span>
              ) : null}
            </div>
            <div className="detail-actions" onClick={(e) => e.stopPropagation()}>
              <div className="field"><label>Status</label>
                <select value={o.status} onChange={(e) => onPatch({ status: e.target.value })}>
                  {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="field"><label>Assigned to</label><input defaultValue={o.assigned_name || ""} placeholder="Tech / advisor" onBlur={(e) => e.target.value !== (o.assigned_name || "") && onPatch({ assigned_name: e.target.value })} /></div>
              <div className="field"><label>Scheduled date</label><input type="date" defaultValue={o.scheduled_date || ""} onChange={(e) => onPatch({ scheduled_date: e.target.value })} /></div>
              <div className="field"><label>Internal notes</label><input defaultValue={o.internal_notes || ""} placeholder="RO #, parts, etc." onBlur={(e) => e.target.value !== (o.internal_notes || "") && onPatch({ internal_notes: e.target.value })} /></div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
