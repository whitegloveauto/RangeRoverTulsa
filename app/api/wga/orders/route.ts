import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm } from "@/lib/session";
import { createShopMonkeyTicket, setShopMonkeyUnit } from "@/lib/shopmonkey";
import { emailOrderEvent } from "@/lib/dealerEmail";
import { dealerStatus } from "@/lib/dealerAccess";
import { getBillingTerms, expectedPayment, localDate, todayLocal } from "@/lib/billing";
import { AWAITING_PAYMENT, ORDER_STATUSES, normalizeStatus, workDone } from "@/lib/orderStatus";

export const runtime = "nodejs";

// Pipeline: new → in ShopMonkey → scheduled → in progress → awaiting payment → complete (= paid).
// See lib/orderStatus.ts. In short: an order goes to "awaiting payment" when the work is done —
// its RO is put in Completed in ShopMonkey, or someone moves it here (the dealership sees that as
// complete); ShopMonkey moves it to complete once the RO is paid. "Invoiced" is a checkmark with
// a date (invoiced_on), not a step.
const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// GET /api/wga/orders?status=new  — all submitted orders across dealerships
export async function GET(req: Request) {
  const s = await requireWgaPerm("orders");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let q = supabaseAdmin
    .from("dealer_quotes")
    .select(
      "id, quote_number, dealership_id, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, stock_number, customer_name, customer_phone, customer_email, line_items, package_snapshot, alacarte_items, retail_total, cost_total, gross_total, status, notes, internal_notes, assigned_name, scheduled_date, submitted_at, status_updated_at, created_at, dealer_user_name, sm_order_id, sm_order_number, sm_synced_at, sm_sync_error, available_from, needed_by, urgency, invoiced_on, invoiced_by, dealer_dealerships(name, short_name)"
    )
    .neq("status", "draft")
    .order("needed_by", { ascending: true, nullsFirst: false })
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (status === AWAITING_PAYMENT) q = q.in("status", [AWAITING_PAYMENT, "invoiced"]);
  else if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  const orders: any[] = (data || []).map((o: any) => ({ ...o, status: normalizeStatus(o.status) }));

  // Paid dates (from the order timeline) + when to expect payment (the dealership's schedule).
  const done = orders.filter((o) => workDone(o.status));
  const doneAt: Record<string, string> = {}; // latest move to awaiting payment
  const paidAt: Record<string, string> = {}; // latest move to complete
  for (let i = 0; i < done.length; i += 150) {
    const { data: ev } = await supabaseAdmin.from("dealer_order_events").select("quote_id, to_status, created_at").in("quote_id", done.slice(i, i + 150).map((o) => o.id)).in("to_status", [AWAITING_PAYMENT, "invoiced", "complete"]);
    for (const e of ev || []) {
      const m = e.to_status === "complete" ? paidAt : doneAt;
      if (!m[e.quote_id] || e.created_at > m[e.quote_id]) m[e.quote_id] = e.created_at;
    }
  }
  const billed = orders.filter((o) => o.invoiced_on || workDone(o.status));
  const terms: Record<string, Awaited<ReturnType<typeof getBillingTerms>>> = {};
  for (const id of Array.from(new Set(billed.map((o) => o.dealership_id)))) terms[id] = await getBillingTerms(id);
  for (const o of billed) {
    if (!o.invoiced_on) {
      // finished before invoice dates were kept on the order: fall back to when it was finished
      const at = doneAt[o.id] || (o.status === "complete" ? paidAt[o.id] : null) || o.status_updated_at;
      o.invoiced_on = at ? localDate(at) : null;
    }
    o.paid_on = o.status === "complete" && paidAt[o.id] ? localDate(paidAt[o.id]) : null;
    const exp = o.invoiced_on && o.status !== "complete" && o.status !== "cancelled" ? expectedPayment(terms[o.dealership_id], o.invoiced_on) : null;
    o.payment_expected = exp?.date || null;
    o.payment_label = exp?.label || null;
  }
  return NextResponse.json({ orders, today: todayLocal() });
}

// PATCH /api/wga/orders — { id, status?, assigned_name?, scheduled_date?, internal_notes?, invoiced?, invoiced_on? }
// invoiced (true / false): tick or clear the "invoiced" checkmark. It can be ticked at any point
//   and doesn't move the order.
// invoiced_on (YYYY-MM-DD): the invoice date (defaults to today); send it alone to correct the date.
// Moving an order to awaiting payment or complete marks it invoiced (today) if it wasn't yet.
export async function PATCH(req: Request) {
  const s = await requireWgaPerm("orders");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  // { id, action: "shopmonkey" } — (re)create the ShopMonkey RO for this order
  if (b.action === "shopmonkey") {
    const r = await createShopMonkeyTicket(b.id);
    if (!r.ok) return NextResponse.json({ error: `ShopMonkey: ${r.error}` }, { status: 502 });
    const unit = await setShopMonkeyUnit(b.id, { force: true });
    return NextResponse.json({ ok: true, sm_order_number: r.number, unit });
  }
  // { id, action: "sm_unit" } — (re)write the dealer order number into the ShopMonkey vehicle's Unit field
  if (b.action === "sm_unit") {
    const unit = await setShopMonkeyUnit(b.id, { force: true });
    return unit.ok
      ? NextResponse.json({ ok: true, unit, message: "Order number is in the vehicle's Unit field in ShopMonkey." })
      : NextResponse.json({ ok: false, unit, error: `ShopMonkey Unit: ${unit.note}` }, { status: 502 });
  }

  const { data: row } = await supabaseAdmin.from("dealer_quotes").select("status, scheduled_date, invoiced_on").eq("id", b.id).single();
  if (!row) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const cur = { ...row, status: normalizeStatus(row.status) };
  if (b.status !== undefined) b.status = normalizeStatus(String(b.status));

  const patch: any = {};
  if (b.status !== undefined) {
    if (!(ORDER_STATUSES as readonly string[]).includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = b.status;
    patch.status_updated_at = new Date().toISOString();
  }
  if (b.assigned_name !== undefined) patch.assigned_name = b.assigned_name || null;
  if (b.scheduled_date !== undefined) patch.scheduled_date = b.scheduled_date || null;
  // Putting a date on an order that hasn't been scheduled yet schedules it (one email, with the date).
  if (b.status === undefined && b.scheduled_date && ["new", "in_shopmonkey"].includes(cur.status)) {
    b.status = "scheduled";
    patch.status = "scheduled";
    patch.status_updated_at = new Date().toISOString();
  }
  if (b.internal_notes !== undefined) patch.internal_notes = b.internal_notes || null;

  // ---- the "invoiced" checkmark
  const today = todayLocal();
  const invDate = ymd(b.invoiced_on);
  if (b.invoiced_on !== undefined && b.invoiced_on !== null && b.invoiced_on !== "" && !invDate) return NextResponse.json({ error: "Bad invoice date." }, { status: 400 });
  if (invDate && invDate > today) return NextResponse.json({ error: "The invoice date can't be in the future." }, { status: 400 });
  const nextStatus: string = patch.status ?? cur.status;
  let invoiceEvent: { type: string; detail: string } | null = null;
  if (b.invoiced === false) {
    if (workDone(nextStatus)) return NextResponse.json({ error: "An order that's awaiting payment or paid stays invoiced. Move it back to In progress first." }, { status: 400 });
    if (cur.invoiced_on) {
      patch.invoiced_on = null;
      patch.invoiced_by = null;
      invoiceEvent = { type: "invoice_cleared", detail: `Invoiced checkmark removed by ${s.userName}` };
    }
  } else if (b.invoiced === true || invDate) {
    const date = invDate || cur.invoiced_on || today;
    if (date !== cur.invoiced_on) {
      patch.invoiced_on = date;
      patch.invoiced_by = s.userName;
      invoiceEvent = cur.invoiced_on
        ? { type: "invoice_date", detail: `Invoice date changed from ${cur.invoiced_on} to ${date} by ${s.userName}` }
        : { type: "invoiced", detail: `Invoiced ${date} · marked by ${s.userName}` };
    }
  }
  const statusChanged = b.status !== undefined && cur.status !== b.status;
  // Awaiting payment / paid always carries an invoice date (statements and "payment expected" run off it).
  if (statusChanged && workDone(b.status) && !cur.invoiced_on && !patch.invoiced_on) {
    patch.invoiced_on = today;
    patch.invoiced_by = s.userName;
    invoiceEvent = { type: "invoiced", detail: `Invoiced ${today} · set when ${s.userName} moved it to ${b.status === AWAITING_PAYMENT ? "awaiting payment" : "complete"}` };
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin.from("dealer_quotes").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "Could not update order." }, { status: 500 });

  if (invoiceEvent) {
    await supabaseAdmin.from("dealer_order_events").insert({ quote_id: b.id, event_type: invoiceEvent.type, actor_name: s.userName, detail: invoiceEvent.detail });
  }
  if (statusChanged) {
    await supabaseAdmin.from("dealer_order_events").insert({
      quote_id: b.id,
      event_type: "status_change",
      from_status: cur.status,
      to_status: b.status,
      actor_name: s.userName,
      detail:
        b.status === AWAITING_PAYMENT
          ? `Work done — awaiting payment (moved by ${s.userName})`
          : b.status === "complete" && cur.status === AWAITING_PAYMENT
          ? `Marked paid by ${s.userName}`
          : `Status set to ${b.status} by ${s.userName}`,
    });
  }
  // Tell the dealership (status moves they care about, or a new install date on a scheduled order).
  // To them awaiting payment already is "complete" (their car is done), so paid afterwards isn't news.
  const before = dealerStatus(cur.status);
  const after = statusChanged ? dealerStatus(b.status) : before;
  if (statusChanged && after !== before && ["scheduled", "in_progress", "complete", "cancelled"].includes(after)) {
    await emailOrderEvent(b.id, { kind: "status", status: after });
  } else if (!statusChanged && b.scheduled_date !== undefined && b.scheduled_date && cur.scheduled_date !== b.scheduled_date && cur.status === "scheduled") {
    await emailOrderEvent(b.id, { kind: "schedule" });
  }
  return NextResponse.json({ ok: true });
}
