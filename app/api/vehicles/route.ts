import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import type { VehicleCatalog } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("dealer_vehicles")
    .select("year, model, trim, sort_order")
    .eq("brand", session.brand)
    .eq("active", true)
    .order("year", { ascending: false })
    .order("sort_order", { ascending: true });

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
    yearsSet.add(row.year);
    if (!byYear[row.year]) byYear[row.year] = {};
    if (!byYear[row.year][row.model]) byYear[row.year][row.model] = [];
    if (!byYear[row.year][row.model].includes(row.trim)) {
      byYear[row.year][row.model].push(row.trim);
    }
  }

  const catalog: VehicleCatalog = {
    years: Array.from(yearsSet).sort((a, b) => b - a),
    byYear,
  };

  return NextResponse.json(catalog);
}
