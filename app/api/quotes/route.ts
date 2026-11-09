import { hideCost } from "@/lib/dealerAccess";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { VIN_RE, normVin, isoDate, urgencyFor, findDuplicate, priceLines, afterSubmit } from "@/lib/submitOrder";
import { canViewQuote, dealerStatus } from "@/lib/dealerAccess";

export const runtime = "nodejs";

// GET /api/quotes — this dealership's quotes/orders (admins + people allowed to see everyone's; others their own)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let q = supabaseAdmin
    .from("dealer_quotes")
    .select(
      "id, quote_number, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, line_items, retail_total, cost_total, gross_total, status, scheduled_date, submitted_at, created_at, dealer_user_name, available_from, needed_by, urgency, sm_order_number"
    )
    .eq("dealership_id", session.dealershipId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (session.role !== "admin" && session.userId && !session.access?.see_all_orders) q = q.eq("dealer_user_id", session.userId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "Could not load quotes." }, { status: 500 });

  const quotes = (data || []).map((r) => ({ ...(session.canSeeCost ? r : hideCost(r)), status: dealerStatus(r.status) }));
  return NextResponse.json({ quotes });
}

// POST /api/quotes — save a quote (draft) or submit an order.
// body: { vehicleYear, vehicleModel, vehicleTrim, vehicleVin (required to submit), notes?, availableFrom?, neededBy?, itemIds: string[], submit: boolean, confirmDuplicate?, quoteId? }
// quoteId = editing a saved quote: that draft is updated (or submitted) instead of creating a new one.
// One option per category (service) — e.g. one PPF coverage, one tint package.
// Orders are tracked by VIN + year/make/model only — the dealership looks up its own customer by VIN.
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
  const { vehicleYear, vehicleModel, vehicleTrim, vehicleVin, notes, itemIds, submit, availableFrom, neededBy } = body;
  const availDate = isoDate(availableFrom);
  const needDate = isoDate(neededBy);
  if (availDate && needDate && needDate < availDate) return NextResponse.json({ error: "\"Needed back by\" can't be before the vehicle is available." }, { status: 400 });
  if (!vehicleYear || !vehicleModel || !vehicleTrim) {
    return NextResponse.json({ error: "Vehicle year, model, and trim are required." }, { status: 400 });
  }
  const vinNorm = normVin(vehicleVin);
  if (submit && !VIN_RE.test(vinNorm)) {
    return NextResponse.json({ error: "Enter the full 17-character VIN to submit the order." }, { status: 400 });
  }
  if (vinNorm && vinNorm.length !== 17) return NextResponse.json({ error: "VIN needs 17 characters." }, { status: 400 });

  // Editing a saved quote?
  let existing: any = null;
  if (body.quoteId) {
    const { data: q } = await supabaseAdmin.from("dealer_quotes").select("*").eq("id", String(body.quoteId)).eq("dealership_id", session.dealershipId).maybeSingle();
    if (!q || !canViewQuote(session, q)) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
    if (q.status !== "draft") return NextResponse.json({ error: "This quote was already submitted.", alreadySubmitted: true }, { status: 409 });
    existing = q;
  }

  // Same car ordered twice? Check this dealership's live orders from the last 30 days by VIN.
  if (submit && !body.confirmDuplicate) {
    const dup = await findDuplicate(session.dealershipId, vinNorm, existing?.id);
    if (dup) return NextResponse.json({ error: "duplicate", duplicate: dup }, { status: 409 });
  }

  const ids: string[] = Array.isArray(itemIds) ? itemIds.filter((x) => typeof x === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Select at least one service." }, { status: 400 });

  // Build the line items from the authoritative book (always with cost, regardless of what the user can see).
  const priced = await priceLines(session.brand, session.dealershipId, vehicleModel, ids);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 400 });
  const lines = priced.lines;
  if (priced.conflict) return NextResponse.json({ error: priced.conflict }, { status: 400 });

  const retailTotal = lines.reduce((s, l) => s + l.retail, 0);
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);
  const isSubmit = !!submit;
  const now = new Date().toISOString();
  const urgency = urgencyFor(needDate);

  if (existing) {
    const { data: upd, error: updErr } = await supabaseAdmin
      .from("dealer_quotes")
      .update({
        vehicle_year: Number(vehicleYear),
        vehicle_model: vehicleModel,
        vehicle_trim: vehicleTrim,
        vehicle_vin: vinNorm || null,
        notes: notes || null,
        available_from: availDate,
        needed_by: needDate,
        urgency,
        line_items: lines,
        retail_total: retailTotal,
        cost_total: costTotal,
        gross_total: retailTotal - costTotal,
        status: isSubmit ? "new" : "draft",
        submitted_at: isSubmit ? now : null,
        status_updated_at: isSubmit ? now : null,
      })
      .eq("id", existing.id)
      .eq("status", "draft")
      .select("id, quote_number");
    if (updErr) return NextResponse.json({ error: "Could not save quote." }, { status: 500 });
    const row = upd?.[0];
    if (!row) return NextResponse.json({ error: "This quote was already submitted.", alreadySubmitted: true }, { status: 409 });
    if (isSubmit) {
      const saver = existing.dealer_user_name && existing.dealer_user_name !== session.userName ? ` (quote saved by ${existing.dealer_user_name})` : "";
      const sm = await afterSubmit(session, { ...row, vehicle_year: vehicleYear, vehicle_model: vehicleModel, vehicle_trim: vehicleTrim }, lines, needDate, urgency, `Submitted by ${session.userName} (${session.name}) from saved quote${saver}`);
      return NextResponse.json({ ok: true, quote: { ...row, ...sm }, submitted: true });
    }
    return NextResponse.json({ ok: true, quote: row, submitted: false });
  }

  const { data, error } = await supabaseAdmin
    .from("dealer_quotes")
    .insert({
      dealership_id: session.dealershipId,
      vehicle_year: Number(vehicleYear),
      vehicle_model: vehicleModel,
      vehicle_trim: vehicleTrim,
      vehicle_vin: vinNorm || null,
      notes: notes || null,
      available_from: availDate,
      needed_by: needDate,
      urgency,
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
    const sm = await afterSubmit(session, { ...data, vehicle_year: vehicleYear, vehicle_model: vehicleModel, vehicle_trim: vehicleTrim }, lines, needDate, urgency);
    return NextResponse.json({ ok: true, quote: { ...data, ...sm }, submitted: true });
  }
  return NextResponse.json({ ok: true, quote: data, submitted: isSubmit });
}
