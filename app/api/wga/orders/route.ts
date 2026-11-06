import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWgaSession } from "@/lib/session";
import { createShopMonkeyTicket } from "@/lib/shopmonkey";

export const runtime = "nodejs";

const ORDER_STATUSES = ["new", "in_shopmonkey", "scheduled", "in_progress", "complete", "cancelled"] as const;

// GET /api/wga/orders?status=new  — all submitted orders across dealerships
export async function GET(req: Request) {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
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
  return NextResponse.json({ orders: data || [] });
}

// PATCH /api/wga/orders — { id, status?, assigned_name?, scheduled_date?, internal_notes? }
export async function PATCH(req: Request) {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
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
    return NextResponse.json({ ok: true, sm_order_number: r.number });
  }

  const { data: cur } = await supabaseAdmin.from("dealer_quotes").select("status").eq("id", b.id).single();
  const patch: any = {};
  if (b.status !== undefined) {
    if (!(ORDER_STATUSES as readonly string[]).includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = b.status;
    patch.status_updated_at = new Date().toISOString();
  }
  if (b.assigned_name !== undefined) patch.assigned_name = b.assigned_name || null;
  if (b.scheduled_date !== undefined) patch.scheduled_date = b.scheduled_date || null;
  if (b.internal_notes !== undefined) patch.internal_notes = b.internal_notes || null;
  patch.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin.from("dealer_quotes").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "Could not update order." }, { status: 500 });

  if (b.status !== undefined && cur && cur.status !== b.status) {
    await supabaseAdmin.from("dealer_order_events").insert({
      quote_id: b.id,
      event_type: "status_change",
      from_status: cur.status,
      to_status: b.status,
      actor_name: s.userName,
      detail: `Status set to ${b.status} by ${s.userName}`,
    });
  }
  return NextResponse.json({ ok: true });
}
