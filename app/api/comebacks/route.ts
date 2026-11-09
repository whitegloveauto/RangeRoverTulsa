import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { notifyWga } from "@/lib/notify";
import { dealerStatus } from "@/lib/dealerAccess";

export const runtime = "nodejs";

// GET ?q=  — search this dealership's past orders (VIN, quote #, RO #, model) to attach a comeback to
// GET      — this dealership's comebacks
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.access && !s.access.comebacks) return NextResponse.json({ error: "Your dealership admin hasn't turned on comebacks for your login." }, { status: 403 });
  const onlyMine = s.role !== "admin" && !!s.userId && !s.access?.see_all_orders;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const { data } = await supabaseAdmin
      .from("dealer_quotes")
      .select("id, quote_number, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, line_items, status, submitted_at, sm_order_number")
      .eq("dealership_id", s.dealershipId)
      .neq("status", "draft")
      .or(`vehicle_vin.ilike.${like},quote_number.ilike.${like},vehicle_model.ilike.${like},sm_order_number.ilike.${like}`)
      .eq(onlyMine ? "dealer_user_id" : "dealership_id", onlyMine ? s.userId! : s.dealershipId)
      .order("submitted_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ results: (data || []).map((r: any) => ({ ...r, status: dealerStatus(r.status) })) });
  }
  const { data } = await supabaseAdmin
    .from("dealer_comebacks")
    .select("id, comeback_number, quote_id, vehicle, vin, category, description, status, scheduled_date, wga_notes, sm_order_number, created_by_name, created_at, resolved_at")
    .eq("dealership_id", s.dealershipId)
    .eq(onlyMine ? "created_by_user_id" : "dealership_id", onlyMine ? s.userId! : s.dealershipId)
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ comebacks: data || [] });
}

// POST { quote_id?, vehicle?, vin?, category, description }
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.access && !s.access.comebacks) return NextResponse.json({ error: "Your dealership admin hasn't turned on comebacks for your login." }, { status: 403 });
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
    const { data } = await supabaseAdmin.from("dealer_quotes").select("id, quote_number, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, sm_order_number").eq("id", b.quote_id).eq("dealership_id", s.dealershipId).maybeSingle();
    orig = data;
  }
  const row = {
    dealership_id: s.dealershipId,
    quote_id: orig?.id || null,
    vehicle: b.vehicle || (orig ? `${orig.vehicle_year} ${orig.vehicle_model} ${orig.vehicle_trim}` : null),
    vin: b.vin || orig?.vehicle_vin || null,
    category: ["ppf", "ceramic", "tint", "windshield", "other"].includes(b.category) ? b.category : "other",
    description,
    created_by_user_id: s.userId,
    created_by_name: s.userName,
  };
  if (!row.vehicle && !row.vin) return NextResponse.json({ error: "Pick the original order or enter the VIN." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("dealer_comebacks").insert(row).select("id, comeback_number").single();
  if (error) return NextResponse.json({ error: "Could not file the comeback." }, { status: 500 });
  if (orig) await supabaseAdmin.from("dealer_order_events").insert({ quote_id: orig.id, event_type: "comeback", actor_name: s.userName, detail: `Comeback ${data.comeback_number}: ${description.slice(0, 160)}` });
  await notifyWga(
    `Comeback · ${s.name}`,
    `${row.vehicle || row.vin} — ${description.slice(0, 140)}${orig?.sm_order_number ? ` (orig RO ${orig.sm_order_number})` : ""}`,
    { comeback_id: data.id, quote_id: orig?.id || null, kind: "comeback" }
  );
  return NextResponse.json({ ok: true, comeback: data });
}
