import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import type { VehicleCatalog } from "@/lib/types";
import { getHiddenVehicles } from "@/lib/dealerCatalog";
import { trimOrder } from "@/lib/trims";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [{ data, error }, hidden] = await Promise.all([supabaseAdmin
    .from("dealer_vehicles")
    .select("id, year, model, trim, sort_order")
    .eq("brand", session.brand)
    .eq("active", true)
    .order("year", { ascending: false })
    .order("sort_order", { ascending: true }), getHiddenVehicles(session.dealershipId)]);

  if (error) {
    return NextResponse.json(
      { error: "Could not load vehicle catalog." },
      { status: 500 }
    );
  }

  // Build a year -> model -> trims[] tree, preserving sort order.
  const byYear: Record<number, Record<string, string[]>> = {};
  const yearsSet = new Set<number>();

  for (const row of data || []) {
    if (hidden.has(row.id)) continue; // this dealership doesn't offer it
    yearsSet.add(row.year);
    if (!byYear[row.year]) byYear[row.year] = {};
    if (!byYear[row.year][row.model]) byYear[row.year][row.model] = [];
    if (!byYear[row.year][row.model].includes(row.trim)) {
      byYear[row.year][row.model].push(row.trim);
    }
  }

  // Trims often share one sort_order — put them in the order a salesperson expects (S → SE → HSE …).
  for (const y of Object.keys(byYear)) for (const m of Object.keys(byYear[Number(y)])) byYear[Number(y)][m].sort(trimOrder);

  const catalog: VehicleCatalog = {
    years: Array.from(yearsSet).sort((a, b) => b - a),
    byYear,
  };

  return NextResponse.json(catalog);
}
