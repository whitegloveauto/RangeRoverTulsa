import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// GET /api/quotes — list this dealership's recent quotes
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("dealer_quotes")
    .select(
      "id, quote_number, vehicle_year, vehicle_model, vehicle_trim, package_tier, retail_total, gross_total, status, created_at"
    )
    .eq("dealership_id", session.dealershipId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: "Could not load quotes." },
      { status: 500 }
    );
  }

  return NextResponse.json({ quotes: data || [] });
}

// POST /api/quotes — save a new quote
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const {
    vehicleYear,
    vehicleModel,
    vehicleTrim,
    vehicleVin,
    packageTier,
    packageSnapshot,
    tintUpgrade,
    alacarteItems,
    retailTotal,
    costTotal,
    grossTotal,
    customerName,
    stockNumber,
    notes,
  } = body;

  if (!vehicleYear || !vehicleModel || !vehicleTrim) {
    return NextResponse.json(
      { error: "Vehicle year, model, and trim are required." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("dealer_quotes")
    .insert({
      dealership_id: session.dealershipId,
      vehicle_year: vehicleYear,
      vehicle_model: vehicleModel,
      vehicle_trim: vehicleTrim,
      vehicle_vin: vehicleVin || null,
      package_tier: packageTier || null,
      package_snapshot: packageSnapshot || null,
      tint_upgrade: !!tintUpgrade,
      alacarte_items: alacarteItems || [],
      retail_total: retailTotal ?? 0,
      cost_total: costTotal ?? 0,
      gross_total: grossTotal ?? 0,
      customer_name: customerName || null,
      stock_number: stockNumber || null,
      notes: notes || null,
      status: "draft",
    })
    .select("id, quote_number")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Could not save quote." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, quote: data });
}
