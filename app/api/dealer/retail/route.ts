import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// PUT /api/dealer/retail — dealer admin sets their own customer prices
// body: { cells: [{ model, item_id, retail }] }  (retail null = use WGA suggested)
export async function PUT(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  let b: { cells?: { model: string; item_id: string; retail: number | null }[] };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const cells = (b.cells || []).filter((c) => c && c.model && c.item_id);
  if (!cells.length) return NextResponse.json({ ok: true, saved: 0 });
  const rows = cells.map((c) => ({
    dealership_id: s.dealershipId,
    model: c.model,
    item_id: c.item_id,
    retail: c.retail === null || c.retail === undefined || Number.isNaN(Number(c.retail)) ? null : Number(c.retail),
    updated_by: s.userEmail || s.userName,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin.from("dealer_retail_prices").upsert(rows, { onConflict: "dealership_id,model,item_id" });
  if (error) return NextResponse.json({ error: "Could not save prices." }, { status: 500 });
  return NextResponse.json({ ok: true, saved: rows.length });
}
