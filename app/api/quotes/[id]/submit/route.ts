import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { canViewQuote } from "@/lib/dealerAccess";
import { VIN_RE, normVin, isoDate, urgencyFor, findDuplicate, priceLines, afterSubmit } from "@/lib/submitOrder";

export const runtime = "nodejs";

// POST /api/quotes/[id]/submit — send a saved quote to White Glove Auto as an order.
// body: { vin?, availableFrom?, neededBy?, confirmDuplicate?, confirmPrice? }
// Prices are re-read from the current book; if they changed since the quote was saved the
// dealer is shown old → new and has to confirm before it goes through.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const b = await req.json().catch(() => ({}));

  const { data: q } = await supabaseAdmin.from("dealer_quotes").select("*").eq("id", params.id).eq("dealership_id", session.dealershipId).maybeSingle();
  if (!q || !canViewQuote(session, q)) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  if (q.status !== "draft") return NextResponse.json({ error: "This quote was already submitted.", alreadySubmitted: true }, { status: 409 });

  const vin = normVin(b.vin ?? q.vehicle_vin);
  if (!VIN_RE.test(vin)) return NextResponse.json({ error: "Enter the full 17-character VIN to submit the order." }, { status: 400 });
  const availDate = b.availableFrom !== undefined ? isoDate(b.availableFrom) : q.available_from || null;
  const needDate = b.neededBy !== undefined ? isoDate(b.neededBy) : q.needed_by || null;
  if (availDate && needDate && needDate < availDate) return NextResponse.json({ error: "\"Needed back by\" can't be before the vehicle is available." }, { status: 400 });

  if (!b.confirmDuplicate) {
    const dup = await findDuplicate(session.dealershipId, vin, q.id);
    if (dup) return NextResponse.json({ error: "duplicate", duplicate: dup }, { status: 409 });
  }

  const ids: string[] = (Array.isArray(q.line_items) ? q.line_items : []).map((l: any) => l.item_id).filter(Boolean);
  if (!ids.length) return NextResponse.json({ error: "This quote has no services to order." }, { status: 400 });
  const priced = await priceLines(session.brand, session.dealershipId, q.vehicle_model, ids);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 400 });
  const lines = priced.lines;
  if (priced.conflict) return NextResponse.json({ error: `${priced.conflict} Tap Edit quote to fix it.`, needsEdit: true }, { status: 400 });
  const retailTotal = lines.reduce((s, l) => s + l.retail, 0);
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);

  const oldRetail = Number(q.retail_total || 0);
  const oldCost = Number(q.cost_total || 0);
  const changed = lines.length !== ids.length || Math.abs(retailTotal - oldRetail) > 0.005 || Math.abs(costTotal - oldCost) > 0.005;
  if (changed && !b.confirmPrice) {
    return NextResponse.json(
      {
        error: "repriced",
        repriced: {
          retail: { was: oldRetail, now: retailTotal },
          ...(session.canSeeCost ? { cost: { was: oldCost, now: costTotal } } : {}),
          dropped: lines.length !== ids.length,
        },
      },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const urgency = urgencyFor(needDate);
  // Only flips a draft: if two people hit Submit at once, the second one gets "already submitted".
  const { data: upd, error } = await supabaseAdmin
    .from("dealer_quotes")
    .update({
      status: "new",
      submitted_at: now,
      status_updated_at: now,
      vehicle_vin: vin,
      available_from: availDate,
      needed_by: needDate,
      urgency,
      line_items: lines,
      retail_total: retailTotal,
      cost_total: costTotal,
      gross_total: retailTotal - costTotal,
    })
    .eq("id", q.id)
    .eq("status", "draft")
    .select("id, quote_number, vehicle_year, vehicle_model, vehicle_trim");
  if (error) return NextResponse.json({ error: "Could not submit the order." }, { status: 500 });
  const row = upd?.[0];
  if (!row) return NextResponse.json({ error: "This quote was already submitted.", alreadySubmitted: true }, { status: 409 });

  const saver = q.dealer_user_name && q.dealer_user_name !== session.userName ? ` (quote saved by ${q.dealer_user_name})` : "";
  const sm = await afterSubmit(session, row, lines, needDate, urgency, `Submitted by ${session.userName} (${session.name}) from saved quote${saver}`);
  return NextResponse.json({ ok: true, quote: { id: row.id, quote_number: row.quote_number, ...sm }, submitted: true });
}
