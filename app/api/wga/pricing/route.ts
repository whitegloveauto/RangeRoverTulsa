import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWgaSession, requireWgaAdmin } from "@/lib/session";
import { loadPricingBook } from "@/lib/pricingBook";

export const runtime = "nodejs";

// GET /api/wga/pricing — full WGA pricing book (cost + suggested retail), incl. inactive
export async function GET() {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const book = await loadPricingBook({ brand: "Range Rover", canSeeCost: true, includeInactive: true });
  return NextResponse.json(book);
}

// PUT /api/wga/pricing — bulk upsert cells: { cells: [{model, item_id, cost, suggested_retail}] }
export async function PUT(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  let body: { cells?: { model: string; item_id: string; cost: number | null; suggested_retail: number | null }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const cells = (body.cells || []).filter((c) => c && c.model && c.item_id);
  if (!cells.length) return NextResponse.json({ ok: true, saved: 0 });

  const rows = cells.map((c) => ({
    brand: "Range Rover",
    model: c.model,
    item_id: c.item_id,
    cost: c.cost === null || c.cost === undefined || Number.isNaN(Number(c.cost)) ? null : Number(c.cost),
    suggested_retail:
      c.suggested_retail === null || c.suggested_retail === undefined || Number.isNaN(Number(c.suggested_retail))
        ? null
        : Number(c.suggested_retail),
    updated_by: s.userEmail,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin.from("dealer_model_pricing").upsert(rows, { onConflict: "brand,model,item_id" });
  if (error) return NextResponse.json({ error: "Could not save pricing." }, { status: 500 });
  return NextResponse.json({ ok: true, saved: rows.length });
}
