import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { loadPricingBook } from "@/lib/pricingBook";
import { notifyWga } from "@/lib/notify";
import type { OrderLine } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/quotes — this dealership's quotes/orders (users see their own, admins see all)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let q = supabaseAdmin
    .from("dealer_quotes")
    .select(
      "id, quote_number, vehicle_year, vehicle_model, vehicle_trim, stock_number, customer_name, line_items, retail_total, cost_total, gross_total, status, scheduled_date, submitted_at, created_at, dealer_user_name"
    )
    .eq("dealership_id", session.dealershipId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (session.role !== "admin" && session.userId) q = q.eq("dealer_user_id", session.userId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Could not load quotes." }, { status: 500 });

  const quotes = (data || []).map((r) => (session.canSeeCost ? r : { ...r, cost_total: null, gross_total: null }));
  return NextResponse.json({ quotes });
}

// POST /api/quotes — save a quote (draft) or submit an order.
// body: { vehicleYear, vehicleModel, vehicleTrim, vehicleVin?, stockNumber?, customerName?, customerPhone?, customerEmail?, notes?, itemIds: string[], submit: boolean }
// Prices are re-read server-side from the pricing book so the client can't alter them.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { vehicleYear, vehicleModel, vehicleTrim, vehicleVin, stockNumber, customerName, customerPhone, customerEmail, notes, itemIds, submit } = body;
  if (!vehicleYear || !vehicleModel || !vehicleTrim) {
    return NextResponse.json({ error: "Vehicle year, model, and trim are required." }, { status: 400 });
  }
  const ids: string[] = Array.isArray(itemIds) ? itemIds.filter((x) => typeof x === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Select at least one service." }, { status: 400 });

  // Build the line items from the authoritative book (always with cost, regardless of what the user can see).
  const book = await loadPricingBook({ brand: session.brand, dealershipId: session.dealershipId, canSeeCost: true });
  const lines: OrderLine[] = [];
  for (const svc of book.services) {
    for (const it of svc.items) {
      if (!ids.includes(it.id)) continue;
      const cell = book.prices[vehicleModel]?.[it.id];
      if (!cell || cell.cost === null) {
        return NextResponse.json({ error: `"${it.name}" is not priced yet for ${vehicleModel}.` }, { status: 400 });
      }
      lines.push({ item_id: it.id, service: svc.name, name: it.name, cost: cell.cost, retail: cell.retail ?? cell.cost });
    }
  }
  if (!lines.length) return NextResponse.json({ error: "Selected services were not found." }, { status: 400 });

  const retailTotal = lines.reduce((s, l) => s + l.retail, 0);
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);
  const isSubmit = !!submit;
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("dealer_quotes")
    .insert({
      dealership_id: session.dealershipId,
      vehicle_year: Number(vehicleYear),
      vehicle_model: vehicleModel,
      vehicle_trim: vehicleTrim,
      vehicle_vin: vehicleVin || null,
      stock_number: stockNumber || null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      customer_email: customerEmail || null,
      notes: notes || null,
      line_items: lines,
      alacarte_items: [],
      package_snapshot: null,
      package_tier: null,
      tint_upgrade: false,
      retail_total: retailTotal,
      cost_total: costTotal,
      gross_total: retailTotal - costTotal,
      status: isSubmit ? "new" : "draft",
      submitted_at: isSubmit ? now : null,
      status_updated_at: isSubmit ? now : null,
      dealer_user_id: session.userId,
      dealer_user_name: session.userName,
    })
    .select("id, quote_number")
    .single();
  if (error) return NextResponse.json({ error: "Could not save quote." }, { status: 500 });

  if (isSubmit && data) {
    await supabaseAdmin.from("dealer_order_events").insert({
      quote_id: data.id,
      event_type: "submitted",
      to_status: "new",
      actor_name: session.userName,
      detail: `Submitted by ${session.userName} (${session.name})`,
    });
    await notifyWga(
      "New Range Rover order",
      `${session.name}: ${vehicleYear} ${vehicleModel} ${vehicleTrim} — ${lines.map((l) => l.name).join(", ")} · $${costTotal.toLocaleString("en-US")}`,
      { quote_id: data.id, quote_number: data.quote_number }
    );
  }
  return NextResponse.json({ ok: true, quote: data, submitted: isSubmit });
}
