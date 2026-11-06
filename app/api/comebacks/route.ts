import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { notifyWga } from "@/lib/notify";

export const runtime = "nodejs";

// GET ?q=  — search this dealership's past orders (customer, VIN, stock, quote #, model) to attach a comeback to
// GET      — this dealership's comebacks
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const { data } = await supabaseAdmin
      .from("dealer_quotes")
      .select("id, quote_number, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, stock_number, customer_name, customer_phone, line_items, status, submitted_at, sm_order_number")
      .eq("dealership_id", s.dealershipId)
      .neq("status", "draft")
      .or(`customer_name.ilike.${like},vehicle_vin.ilike.${like},stock_number.ilike.${like},quote_number.ilike.${like},vehicle_model.ilike.${like},customer_phone.ilike.${like},sm_order_number.ilike.${like}`)
      .order("submitted_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ results: data || [] });
  }
  const { data } = await supabaseAdmin
    .from("dealer_comebacks")
    .select("id, comeback_number, quote_id, customer_name, vehicle, vin, category, description, status, scheduled_date, wga_notes, sm_order_number, created_by_name, created_at, resolved_at")
    .eq("dealership_id", s.dealershipId)
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ comebacks: data || [] });
}

// POST { quote_id?, customer_name?, customer_phone?, vehicle?, vin?, category, description }
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const description = String(b.description || "").trim();
  if (!description) return NextResponse.json({ error: "Describe the issue." }, { status: 400 });
  let orig: any = null;
  if (b.quote_id) {
    const { data } = await supabaseAdmin.from("dealer_quotes").select("id, quote_number, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, customer_name, customer_phone, sm_order_number").eq("id", b.quote_id).eq("dealership_id", s.dealershipId).maybeSingle();
    orig = data;
  }
  const row = {
    dealership_id: s.dealershipId,
    quote_id: orig?.id || null,
    customer_name: b.customer_name || orig?.customer_name || null,
    customer_phone: b.customer_phone || orig?.customer_phone || null,
    vehicle: b.vehicle || (orig ? `${orig.vehicle_year} ${orig.vehicle_model} ${orig.vehicle_trim}` : null),
    vin: b.vin || orig?.vehicle_vin || null,
    category: ["ppf", "ceramic", "tint", "windshield", "other"].includes(b.category) ? b.category : "other",
    description,
    created_by_user_id: s.userId,
    created_by_name: s.userName,
  };
  if (!row.vehicle && !row.customer_name && !row.vin) return NextResponse.json({ error: "Pick the original order or enter the customer / vehicle." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("dealer_comebacks").insert(row).select("id, comeback_number").single();
  if (error) return NextResponse.json({ error: "Could not file the comeback." }, { status: 500 });
  if (orig) await supabaseAdmin.from("dealer_order_events").insert({ quote_id: orig.id, event_type: "comeback", actor_name: s.userName, detail: `Comeback ${data.comeback_number}: ${description.slice(0, 160)}` });
  await notifyWga(
    `Comeback · ${s.name}`,
    `${row.vehicle || row.customer_name || row.vin} — ${description.slice(0, 140)}${orig?.sm_order_number ? ` (orig RO ${orig.sm_order_number})` : ""}`,
    { comeback_id: data.id, quote_id: orig?.id || null, kind: "comeback" }
  );
  return NextResponse.json({ ok: true, comeback: data });
}
