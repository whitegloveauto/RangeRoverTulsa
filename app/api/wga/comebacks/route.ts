import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm } from "@/lib/session";
import { emailComebackEvent } from "@/lib/dealerEmail";

export const runtime = "nodejs";
const STATUSES = ["open", "scheduled", "resolved", "declined"];

// GET ?status= — comebacks across all dealerships
export async function GET(req: Request) {
  const s = await requireWgaPerm("comebacks");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  const status = new URL(req.url).searchParams.get("status");
  let q = supabaseAdmin
    .from("dealer_comebacks")
    .select("id, comeback_number, dealership_id, quote_id, customer_name, customer_phone, vehicle, vin, category, description, status, scheduled_date, wga_notes, sm_order_number, created_by_name, created_at, resolved_at, dealer_dealerships(name, short_name), dealer_quotes(quote_number, sm_order_number, submitted_at, line_items)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Could not load comebacks." }, { status: 500 });
  return NextResponse.json({ comebacks: data || [] });
}

// PATCH { id, status?, scheduled_date?, wga_notes?, sm_order_number? }
export async function PATCH(req: Request) {
  const s = await requireWgaPerm("comebacks");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const { data: cur } = await supabaseAdmin.from("dealer_comebacks").select("status, scheduled_date, wga_notes").eq("id", b.id).maybeSingle();
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = b.status;
    patch.resolved_at = b.status === "resolved" || b.status === "declined" ? new Date().toISOString() : null;
  }
  for (const k of ["scheduled_date", "wga_notes", "sm_order_number"]) if (b[k] !== undefined) patch[k] = b[k] || null;
  const { error } = await supabaseAdmin.from("dealer_comebacks").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
  // Email the dealership when something they'd act on changes (not on every keystroke of internal fields).
  if (cur) {
    const statusChanged = b.status !== undefined && b.status !== cur.status;
    const dateChanged = b.scheduled_date !== undefined && (b.scheduled_date || null) !== (cur.scheduled_date || null) && !!b.scheduled_date;
    const noteChanged = b.wga_notes !== undefined && (b.wga_notes || "") !== (cur.wga_notes || "") && !!b.wga_notes && b.notify_note === true;
    if (statusChanged || dateChanged || noteChanged) {
      await emailComebackEvent(b.id, { status: statusChanged ? b.status : undefined, scheduled: dateChanged, note: noteChanged ? b.wga_notes : statusChanged && b.wga_notes ? b.wga_notes : undefined });
    }
  }
  return NextResponse.json({ ok: true });
}
