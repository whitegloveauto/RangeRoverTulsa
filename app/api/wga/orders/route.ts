import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm } from "@/lib/session";
import { createShopMonkeyTicket, setShopMonkeyUnit } from "@/lib/shopmonkey";
import { emailOrderEvent } from "@/lib/dealerEmail";
import { getBillingTerms, expectedPayment, localDate, localMidnightUtc, todayLocal } from "@/lib/billing";

export const runtime = "nodejs";

// Pipeline: new → in ShopMonkey → scheduled → in progress → invoiced → complete (= paid).
// The dealership sees "invoiced" as complete (their car is done); WGA keeps it open until paid.
const ORDER_STATUSES = ["new", "in_shopmonkey", "scheduled", "in_progress", "invoiced", "complete", "cancelled"] as const;
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
      "id, quote_number, dealership_id, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, stock_number, customer_name, customer_phone, customer_email, line_items, package_snapshot, alacarte_items, retail_total, cost_total, gross_total, status, notes, internal_notes, assigned_name, scheduled_date, submitted_at, status_updated_at, created_at, dealer_user_name, sm_order_id, sm_order_number, sm_synced_at, sm_sync_error, available_from, needed_by, urgency, dealer_dealerships(name, short_name)"
    )
    .neq("status", "draft")
    .order("needed_by", { ascending: true, nullsFirst: false })
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Could not load orders." }, { status: 500 });
  const orders: any[] = data || [];

  // Invoice / paid dates (from the order timeline) + when to expect payment (dealership's schedule).
  const billed = orders.filter((o) => o.status === "invoiced" || o.status === "complete");
  const invAt: Record<string, string> = {};
  const paidAt: Record<string, string> = {};
  for (let i = 0; i < billed.length; i += 150) {
    const { data: ev } = await supabaseAdmin.from("dealer_order_events").select("quote_id, to_status, created_at").in("quote_id", billed.slice(i, i + 150).map((o) => o.id)).in("to_status", ["invoiced", "complete"]);
    for (const e of ev || []) {
      const m = e.to_status === "invoiced" ? invAt : paidAt;
      if (!m[e.quote_id] || e.created_at > m[e.quote_id]) m[e.quote_id] = e.created_at;
    }
  }
  const terms: Record<string, Awaited<ReturnType<typeof getBillingTerms>>> = {};
  for (const id of Array.from(new Set(billed.map((o) => o.dealership_id)))) terms[id] = await getBillingTerms(id);
  for (const o of billed) {
    const inv = invAt[o.id] || (o.status === "complete" ? paidAt[o.id] : null) || o.status_updated_at;
    o.invoiced_on = inv ? localDate(inv) : null;
    o.paid_on = o.status === "complete" && paidAt[o.id] ? localDate(paidAt[o.id]) : null;
    const exp = o.invoiced_on ? expectedPayment(terms[o.dealership_id], o.invoiced_on) : null;
    o.payment_expected = exp?.date || null;
    o.payment_label = exp?.label || null;
  }
  return NextResponse.json({ orders, today: todayLocal() });
}

// PATCH /api/wga/orders — { id, status?, assigned_name?, scheduled_date?, internal_notes?, invoiced_on? }
// invoiced_on (YYYY-MM-DD): the invoice date — set when marking invoiced, or to correct it later.
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

  const { data: cur } = await supabaseAdmin.from("dealer_quotes").select("status, scheduled_date").eq("id", b.id).single();
  const patch: any = {};
  if (b.status !== undefined) {
    if (!(ORDER_STATUSES as readonly string[]).includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = b.status;
    patch.status_updated_at = new Date().toISOString();
  }
  if (b.assigned_name !== undefined) patch.assigned_name = b.assigned_name || null;
  if (b.scheduled_date !== undefined) patch.scheduled_date = b.scheduled_date || null;
  // Putting a date on an order that hasn't been scheduled yet schedules it (one email, with the date).
  if (b.status === undefined && b.scheduled_date && cur && ["new", "in_shopmonkey"].includes(cur.status)) {
    b.status = "scheduled";
    patch.status = "scheduled";
    patch.status_updated_at = new Date().toISOString();
  }
  if (b.internal_notes !== undefined) patch.internal_notes = b.internal_notes || null;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin.from("dealer_quotes").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "Could not update order." }, { status: 500 });

  const invDate = ymd(b.invoiced_on);
  // invoice event stamped at noon (Tulsa) on the invoice date when one is given
  const invStamp = invDate && invDate !== todayLocal() ? new Date(localMidnightUtc(invDate) + 12 * 3600000).toISOString() : null;
  if (b.status !== undefined && cur && cur.status !== b.status) {
    await supabaseAdmin.from("dealer_order_events").insert({
      quote_id: b.id,
      event_type: "status_change",
      from_status: cur.status,
      to_status: b.status,
      actor_name: s.userName,
      detail: b.status === "invoiced" ? `Invoiced${invDate ? ` ${invDate}` : ""} by ${s.userName}` : b.status === "complete" && cur.status === "invoiced" ? `Marked paid by ${s.userName}` : `Status set to ${b.status} by ${s.userName}`,
      ...(b.status === "invoiced" && invStamp ? { created_at: invStamp } : {}),
    });
  } else if (invDate && cur && (cur.status === "invoiced" || cur.status === "complete")) {
    // correcting the invoice date on an already-invoiced order: move its latest invoice event (or add one)
    const { data: ev } = await supabaseAdmin.from("dealer_order_events").select("id").eq("quote_id", b.id).eq("to_status", "invoiced").order("created_at", { ascending: false }).limit(1);
    const stamp = new Date(localMidnightUtc(invDate) + 12 * 3600000).toISOString();
    if (ev?.[0]) await supabaseAdmin.from("dealer_order_events").update({ created_at: stamp, detail: `Invoiced ${invDate} (date set by ${s.userName})` }).eq("id", ev[0].id);
    else await supabaseAdmin.from("dealer_order_events").insert({ quote_id: b.id, event_type: "status_change", from_status: "in_progress", to_status: "invoiced", actor_name: s.userName, detail: `Invoiced ${invDate} (date set by ${s.userName})`, created_at: stamp });
  }
  // Tell the dealership (status moves they care about, or a new install date on a scheduled order).
  const statusChanged = b.status !== undefined && cur && cur.status !== b.status;
  // Invoiced = the dealer's car is done (they get the "complete" email). Paid after invoiced: no email.
  const dealerStatus = b.status === "invoiced" ? "complete" : b.status === "complete" && cur?.status === "invoiced" ? null : b.status;
  if (statusChanged && dealerStatus && ["scheduled", "in_progress", "complete", "cancelled"].includes(dealerStatus)) {
    await emailOrderEvent(b.id, { kind: "status", status: dealerStatus });
  } else if (!statusChanged && b.scheduled_date !== undefined && b.scheduled_date && cur && cur.scheduled_date !== b.scheduled_date && cur.status === "scheduled") {
    await emailOrderEvent(b.id, { kind: "schedule" });
  }
  return NextResponse.json({ ok: true });
}
