"use client";

import { Fragment, useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import OrderActivity from "@/components/OrderActivity";
import { useWgaSession } from "@/lib/useDealerSession";
import { useIsPhone } from "@/lib/useIsPhone";

// Live urgency from the deadline: <3 days urgent, <7 soon. Done/cancelled orders aren't urgent.
function dueInfo(o: any): { label: string; cls: string } | null {
  if (!o.needed_by) return null;
  const d = Math.ceil((new Date(o.needed_by + "T00:00:00").getTime() - Date.now()) / 86400000);
  const closed = o.status === "complete" || o.status === "cancelled" || o.status === "awaiting_payment";
  const when = new Date(o.needed_by + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (closed) return { label: `Due ${when}`, cls: "due" };
  if (d < 0) return { label: `Overdue ${-d}d`, cls: "due urgent" };
  if (d === 0) return { label: "Due today", cls: "due urgent" };
  if (d < 3) return { label: `Due ${when} · ${d}d`, cls: "due urgent" };
  if (d < 7) return { label: `Due ${when} · ${d}d`, cls: "due soon" };
  return { label: `Due ${when}`, cls: "due" };
}
const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const STATUSES = [
  ["new", "New"],
  ["in_shopmonkey", "In ShopMonkey"],
  ["scheduled", "Scheduled"],
  ["in_progress", "In progress"],
  ["awaiting_payment", "Awaiting payment"],
  ["complete", "Paid · complete"],
  ["cancelled", "Cancelled"],
] as const;
const nice = (ymd: string) => new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const day = (ymd: string) => new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
// The dates the dealership gave with the order: when the car can come in, and when they need it back.
const windowText = (o: any) =>
  o.available_from || o.needed_by ? `${o.available_from ? `available ${day(o.available_from)}` : "available any time"} → ${o.needed_by ? `needed back ${day(o.needed_by)}` : "no deadline"}` : "no dates given";
const todayYmd = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

// The "invoiced" checkmark on a vehicle. It can be ticked at any point — usually while the car is
// still in the shop — and doesn't move the order. Once the order is awaiting payment it stays ticked.
function InvoicedCheck({ o, onPatch }: { o: any; onPatch: (b: any) => Promise<void> }) {
  // the tick shows at once; the saved value takes over when the save comes back
  const [pending, setPending] = useState<boolean | null>(null);
  if (o.status === "cancelled" || o.status === "complete") return null;
  const locked = o.status === "awaiting_payment";
  const on = pending ?? !!o.invoiced_on;
  async function toggle(v: boolean) {
    setPending(v);
    try {
      await onPatch({ invoiced: v });
    } finally {
      setPending(null);
    }
  }
  return (
    <label className={"check inv-check" + (on ? " on" : "")} onClick={(e) => e.stopPropagation()} title={locked ? "Awaiting payment — this order stays invoiced" : on ? "Untick if this hasn't been invoiced after all" : "Tick when the invoice has gone to the dealership"}>
      <input type="checkbox" checked={on} disabled={locked || pending !== null} onChange={(e) => toggle(e.target.checked)} />
      {o.invoiced_on ? `Invoiced ${nice(o.invoiced_on)}` : "Invoiced"}
    </label>
  );
}

// Under the status pill: when to expect the money for an invoiced order, or when it was paid.
function BillingNote({ o }: { o: any }) {
  if (o.status === "complete" && (o.paid_on || o.invoiced_on)) {
    return <div className="bill-note">{o.invoiced_on ? `Invoiced ${nice(o.invoiced_on)}` : ""}{o.paid_on ? `${o.invoiced_on ? " · " : ""}Paid ${nice(o.paid_on)}` : ""}</div>;
  }
  if (o.status !== "cancelled" && o.invoiced_on && o.payment_label) {
    const late = o.payment_expected && o.payment_expected < todayYmd();
    return <div className={"bill-note" + (late ? " late" : "")}>{late ? `Payment late · was due ${nice(o.payment_expected)}` : o.payment_label}</div>;
  }
  return null;
}

// Invoice date + the hand-made steps in an expanded order.
function BillingActions({ o, onPatch }: { o: any; onPatch: (b: any) => Promise<void> }) {
  const working = ["new", "in_shopmonkey", "scheduled", "in_progress"].includes(o.status);
  const awaiting = o.status === "awaiting_payment";
  if (!working && !awaiting) return null;
  return (
    <div className="bill-actions">
      {o.invoiced_on ? (
        <div className="field"><label>Invoiced on</label><input type="date" key={o.invoiced_on} defaultValue={o.invoiced_on} max={todayYmd()} onBlur={(e) => e.target.value && e.target.value !== o.invoiced_on && onPatch({ invoiced_on: e.target.value })} /></div>
      ) : null}
      {o.invoiced_on && o.payment_label ? <span className="bill-exp">{o.payment_label}</span> : null}
      {working && !o.invoiced_on ? <button className="btn-ghost btn-sm" onClick={() => onPatch({ invoiced: true })}>Mark invoiced</button> : null}
      {o.status === "in_progress" ? <button className="btn-primary btn-sm" title="The work is done. The dealership is told their car is ready; the order waits here until it's paid." onClick={() => onPatch({ status: "awaiting_payment" })}>Work done → Awaiting payment</button> : null}
      {awaiting ? <button className="btn-primary btn-sm" title="ShopMonkey does this on its own once the RO is paid" onClick={() => onPatch({ status: "complete" })}>Mark paid</button> : null}
      {awaiting ? <span className="bill-exp">Moves to Complete on its own when the RO is paid in ShopMonkey.</span> : null}
    </div>
  );
}

export default function WgaOrdersPage() {
  const { session, ready } = useWgaSession();
  const [filter, setFilter] = useState("open");
  const isPhone = useIsPhone();
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState("");
  const [sync, setSync] = useState<null | { busy?: boolean; res?: any; open?: boolean }>(null);

  async function syncNow() {
    setSync({ busy: true });
    const r = await fetch("/api/wga/sm-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const res = await r.json().catch(() => ({ ok: false, error: "No response" }));
    setSync({ res, open: true });
    if (res.ok) await load();
  }

  async function load(f = filter) {
    // "open" = everything not finished; the API filters single statuses, so fetch all and trim here
    const r = await fetch("/api/wga/orders?status=" + (f === "open" ? "all" : f));
    if (!r.ok) return;
    const all = (await r.json()).orders || [];
    setRows(f === "open" ? all.filter((o: any) => !["awaiting_payment", "complete", "cancelled"].includes(o.status)) : all);
  }
  useEffect(() => {
    if (ready) load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filter]);

  async function patch(id: string, body: any) {
    setMsg("");
    setInfo("");
    const r = await fetch("/api/wga/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setMsg(d.error || "Update failed");
    else if (d.message) setInfo(d.message);
    await load();
  }

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;

  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} />
      <main>
        <div className="stage" style={{ maxWidth: 1240 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">DEALER ORDERS</div>
            <div className="stage-title">Work coming in.</div>
            <div className="stage-sub">Orders submitted from the dealership portal. Each one moves through ShopMonkey → scheduled → in progress → awaiting payment → paid. Tick Invoiced on a vehicle when its invoice goes out — that can be while it&apos;s still in the shop. Paid orders land in Complete. Trim is on every order so patterns get cut for the right variant.</div>
          </div>
          <div className="tabs">
            {[["open", "Open"], ["new", "New"], ["in_shopmonkey", "In ShopMonkey"], ["scheduled", "Scheduled"], ["in_progress", "In progress"], ["awaiting_payment", "Awaiting payment"], ["complete", "Complete"], ["all", "All"]].map(([k, l]) => (
              <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}
          {info ? <div className="notice ok">{info}</div> : null}
          <div className="sm-sync-bar">
            <span>ShopMonkey moves orders for you every 10 minutes: on the calendar → Scheduled, In Progress on the board → In progress, and paid → Complete once an order is in Awaiting payment. Moving a finished car to Awaiting payment is done here by hand — that&apos;s when the dealership is told it&apos;s done.</span>
            <button className="btn-ghost btn-sm" disabled={!!sync?.busy} onClick={syncNow}>{sync?.busy ? "Checking ShopMonkey…" : "Sync ShopMonkey now"}</button>
          </div>
          {sync?.res && sync.open ? (
            <div className={"notice" + (sync.res.ok ? "" : " warn")} style={{ position: "relative" }}>
              <button className="link-btn" style={{ position: "absolute", right: 12, top: 10 }} onClick={() => setSync({ ...sync, open: false })}>close</button>
              {sync.res.ok ? (
                <>
                  <b>Checked {sync.res.checked} open RO{sync.res.checked === 1 ? "" : "s"} · {sync.res.changed} moved.</b>
                  {sync.res.workflowStatuses?.length ? <div style={{ fontSize: 11, marginTop: 6, color: "var(--text-3)" }}>Your ShopMonkey workflow: {sync.res.workflowStatuses.join(" → ")}</div> : null}
                  {sync.res.lines?.length ? (
                    <div className="tbl-wrap" style={{ marginTop: 10 }}>
                      <table className="tbl compact">
                        <thead><tr><th>Order</th><th>RO</th><th>ShopMonkey</th><th>Portal</th><th>Why</th></tr></thead>
                        <tbody>
                          {sync.res.lines.map((l: any) => (
                            <tr key={l.quote_number}><td>{l.quote_number}</td><td>{l.ro || "—"}</td><td>{l.workflow || l.sm_status || "—"}</td><td>{(() => { const lab = (k: string) => (STATUSES.find((x) => x[0] === k) || [k, k])[1]; return l.to ? <b>{lab(l.from)} → {lab(l.to)}</b> : lab(l.from); })()}</td><td style={{ fontSize: 11 }}>{l.note}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <div style={{ marginTop: 6 }}>No open orders with a ShopMonkey RO.</div>}
                </>
              ) : <>ShopMonkey sync failed: {sync.res.error || "unknown error"}</>}
            </div>
          ) : null}

          {/* Phones: one card per order, tap to expand actions */}
          {isPhone ? <div className="order-cards">
            {rows.length === 0 ? <div className="card" style={{ textAlign: "center" }}>Nothing here.</div> : null}
            {rows.map((o) => (
              <OrderCard key={o.id} o={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} onPatch={(b) => patch(o.id, b)} />
            ))}
          </div> : null}

          {!isPhone ? <div className="tbl-wrap desktop-only">
            <table className="tbl">
              <thead>
                <tr><th>Submitted</th><th>Available / due</th><th>Quote #</th><th>RO #</th><th>Dealership</th><th>Vehicle</th><th>Services</th><th>Status</th><th style={{ textAlign: "right" }}>WGA bills</th><th style={{ textAlign: "right" }}>Dealer retail</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={10} style={{ textAlign: "center", padding: 28 }}>Nothing here.</td></tr> : null}
                {rows.map((o) => (
                  <OrderRow key={o.id} o={o} open={open === o.id} onToggle={() => setOpen(open === o.id ? null : o.id)} onPatch={(b) => patch(o.id, b)} />
                ))}
              </tbody>
            </table>
          </div> : null}
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
        <td>{o.available_from ? <div style={{ fontSize: 11, marginBottom: 5, whiteSpace: "nowrap" }}>Available <b>{day(o.available_from)}</b></div> : null}{(() => { const d = dueInfo(o); return d ? <span className={"status-pill " + d.cls}>{d.label}</span> : o.available_from ? <span style={{ fontSize: 11, color: "var(--text-3)" }}>no deadline</span> : <span style={{ fontSize: 11, color: "var(--text-3)" }}>no dates given</span>; })()}</td>
        <td><b>{o.quote_number}</b></td>
        <td>{o.sm_order_number ? <b style={{ color: "var(--gold-bright)" }}>RO {o.sm_order_number}</b> : o.sm_sync_error ? <span className="status-pill cancelled" title={o.sm_sync_error}>SM failed</span> : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
        <td>{o.dealer_dealerships?.name || "—"}<br /><span style={{ fontSize: 11 }}>{o.dealer_user_name || ""}</span></td>
        <td><b>{o.vehicle_year} {o.vehicle_model}</b><br /><span style={{ fontSize: 11, color: "var(--gold-bright)" }}>{o.vehicle_trim}</span>{o.vehicle_vin ? <div className="vin" style={{ fontSize: 11, color: "var(--text-3)" }}>…{o.vehicle_vin.slice(-8)}</div> : null}</td>
        <td>{lines.map((l) => l.name).join(", ")}</td>
        <td><span className={"status-pill " + o.status}>{(STATUSES.find((s) => s[0] === o.status) || [o.status, o.status])[1]}</span>{o.scheduled_date && !["awaiting_payment", "complete"].includes(o.status) ? <div style={{ fontSize: 11, marginTop: 4, whiteSpace: "nowrap" }}>Starts {day(o.scheduled_date)}</div> : null}<InvoicedCheck o={o} onPatch={onPatch} /><BillingNote o={o} /></td>
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
              <span>Dealership&apos;s window <b>{windowText(o)}</b></span>
              {o.vehicle_vin ? <span>VIN <b className="vin">{o.vehicle_vin}</b></span> : null}
              {o.notes ? <span>Dealer notes <b>{o.notes}</b></span> : null}
              {o.sm_order_number ? <span onClick={(e) => e.stopPropagation()}>ShopMonkey <b>RO {o.sm_order_number}</b>{o.sm_synced_at ? ` · ${new Date(o.sm_synced_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""} <button className="link-btn" title="Writes this order number into the vehicle's Unit field in ShopMonkey" onClick={() => onPatch({ action: "sm_unit" })}>Put {o.quote_number} in Unit</button></span> : null}
              {!o.sm_order_number ? (
                <span onClick={(e) => e.stopPropagation()}>
                  ShopMonkey <b style={{ color: o.sm_sync_error ? "#e06b6b" : undefined }}>{o.sm_sync_error ? `failed — ${o.sm_sync_error}` : "no RO yet"}</b>{" "}
                  <button className="link-btn" onClick={() => onPatch({ action: "shopmonkey" })}>Create RO now</button>
                </span>
              ) : null}
            </div>
            <div onClick={(e) => e.stopPropagation()}><BillingActions o={o} onPatch={onPatch} /></div>
            <div className="detail-actions" onClick={(e) => e.stopPropagation()}>
              <div className="field"><label>Status</label>
                <select value={o.status} onChange={(e) => onPatch({ status: e.target.value })}>
                  {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="field" title="Fills in on its own with the first day the RO is on the ShopMonkey calendar. A date typed here is replaced once the RO is on the calendar."><label>Scheduled date · from ShopMonkey calendar</label><input type="date" key={o.scheduled_date || "none"} defaultValue={o.scheduled_date || ""} onBlur={(e) => e.target.value !== (o.scheduled_date || "") && onPatch({ scheduled_date: e.target.value })} /></div>
              <div className="field"><label>Internal notes</label><input defaultValue={o.internal_notes || ""} placeholder="RO #, parts, etc." onBlur={(e) => e.target.value !== (o.internal_notes || "") && onPatch({ internal_notes: e.target.value })} /></div>
            </div>
            <div style={{ marginTop: 16 }} onClick={(e) => e.stopPropagation()}><OrderActivity quoteId={o.id} side="wga" /></div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function OrderCard({ o, open, onToggle, onPatch }: { o: any; open: boolean; onToggle: () => void; onPatch: (b: any) => Promise<void> }) {
  const lines: any[] = o.line_items?.length ? o.line_items : [...(o.package_snapshot?.items || []), ...(o.alacarte_items || [])];
  const when = o.submitted_at || o.created_at;
  return (
    <div className={"order-card" + (open ? " open" : "")}>
      <div onClick={onToggle} style={{ cursor: "pointer" }}>
        <div className="oc-top">
          <span className={"status-pill " + o.status}>{(STATUSES.find((s) => s[0] === o.status) || [o.status, o.status])[1]}</span>
          <span className="oc-num">{o.sm_order_number ? <b style={{ color: "var(--gold-bright)" }}>RO {o.sm_order_number}</b> : o.sm_sync_error ? <span style={{ color: "#e06b6b" }}>SM failed</span> : "no RO"}</span>
        </div>
        {(() => { const d = dueInfo(o); return d || o.available_from ? <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 10px" }}>{o.available_from ? <span style={{ fontSize: 11, color: "var(--text-2)" }}>Available <b>{day(o.available_from)}</b></span> : null}{d ? <span className={"status-pill " + d.cls}>{d.label}</span> : null}</div> : <div style={{ marginBottom: 8, fontSize: 11, color: "var(--text-3)" }}>No dates given</div>; })()}
        <InvoicedCheck o={o} onPatch={onPatch} />
        <BillingNote o={o} />
        <div className="oc-vehicle">{o.vehicle_year} {o.vehicle_model} <span>{o.vehicle_trim}</span></div>
        <div className="oc-services">{lines.map((l) => l.name).join(" · ") || "—"}</div>
        <div className="oc-meta">
          <span>{o.dealer_dealerships?.name || "—"}</span>
          <span>{new Date(when).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(when).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
          {o.dealer_user_name ? <span>{o.dealer_user_name}</span> : null}
          {o.vehicle_vin ? <span className="vin">VIN …{o.vehicle_vin.slice(-8)}</span> : null}
          {o.scheduled_date ? <span>Starts {day(o.scheduled_date)}</span> : null}
        </div>
        <div className="oc-totals">
          <div><small>WGA bills</small><b>{money(o.cost_total)}</b></div>
          <div><small>Dealer retail</small><b>{money(o.retail_total)}</b></div>
          <span className="oc-chev">{open ? "▴" : "▾"}</span>
        </div>
      </div>
      {open ? (
        <div className="oc-detail">
          <div className="detail-lines">
            <span className="h">Line item</span><span className="h r">Bills</span><span className="h r">Retail</span>
            {lines.map((l, i) => (
              <Fragment key={i}>
                <span>{l.name}</span>
                <span className="r">{money(l.cost)}</span>
                <span className="r">{money(l.retail)}</span>
              </Fragment>
            ))}
          </div>
          <div className="detail-meta" style={{ marginTop: 12 }}>
            <span>Quote <b>{o.quote_number}</b></span>
            <span>Dealership&apos;s window <b>{windowText(o)}</b></span>
            {o.vehicle_vin ? <span>VIN <b className="vin">{o.vehicle_vin}</b></span> : null}
            {o.notes ? <span>Dealer notes <b>{o.notes}</b></span> : null}
            {o.sm_order_number ? <span>ShopMonkey <b>RO {o.sm_order_number}</b></span> : (
              <span>ShopMonkey <b style={{ color: o.sm_sync_error ? "#e06b6b" : undefined }}>{o.sm_sync_error ? `failed — ${o.sm_sync_error}` : "no RO yet"}</b></span>
            )}
          </div>
          <BillingActions o={o} onPatch={onPatch} />
          <div className="oc-actions">
            {!o.sm_order_number ? <button className="btn-primary btn-sm" onClick={() => onPatch({ action: "shopmonkey" })}>Create RO in ShopMonkey</button> : null}
            <div className="field"><label>Status</label>
              <select value={o.status} onChange={(e) => onPatch({ status: e.target.value })}>
                {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div className="field" title="Fills in on its own with the first day the RO is on the ShopMonkey calendar. A date typed here is replaced once the RO is on the calendar."><label>Scheduled date · from ShopMonkey calendar</label><input type="date" key={o.scheduled_date || "none"} defaultValue={o.scheduled_date || ""} onBlur={(e) => e.target.value !== (o.scheduled_date || "") && onPatch({ scheduled_date: e.target.value })} /></div>
            <div className="field"><label>Internal notes</label><input defaultValue={o.internal_notes || ""} placeholder="Parts, notes…" onBlur={(e) => e.target.value !== (o.internal_notes || "") && onPatch({ internal_notes: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 16 }}><OrderActivity quoteId={o.id} side="wga" /></div>
        </div>
      ) : null}
    </div>
  );
}
