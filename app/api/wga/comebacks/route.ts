import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWgaSession } from "@/lib/session";

export const runtime = "nodejs";
const STATUSES = ["open", "scheduled", "resolved", "declined"];

// GET ?status= — comebacks across all dealerships
export async function GET(req: Request) {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
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
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "Bad status." }, { status: 400 });
    patch.status = b.status;
    patch.resolved_at = b.status === "resolved" || b.status === "declined" ? new Date().toISOString() : null;
  }
  for (const k of ["scheduled_date", "wga_notes", "sm_order_number"]) if (b[k] !== undefined) patch[k] = b[k] || null;
  const { error } = await supabaseAdmin.from("dealer_comebacks").update(patch).eq("id", b.id);
  if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
