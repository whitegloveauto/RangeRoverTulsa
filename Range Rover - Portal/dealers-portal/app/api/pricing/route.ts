import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import type { PricingResponse } from "@/lib/types";

export const runtime = "nodejs";

// Tint upgrade is a fixed program option (2-door -> full vehicle).
// Kept here rather than in the DB since it's a single program-wide constant;
// move to a settings table later if it needs to be brand-configurable.
const TINT_UPGRADE = { retail: 699, cost: 449 };

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const [pkgResult, acResult] = await Promise.all([
    supabaseAdmin
      .from("dealer_packages")
      .select(
        "id, brand, tier, tier_order, tier_index, items, retail_total, cost_total, gross_total"
      )
      .eq("brand", session.brand)
      .eq("active", true)
      .order("tier_order", { ascending: true }),
    supabaseAdmin
      .from("dealer_alacarte_catalog")
      .select(
        "id, item_key, group_label, group_order, item_order, name, retail, cost"
      )
      .eq("brand", session.brand)
      .eq("active", true)
      .order("group_order", { ascending: true })
      .order("item_order", { ascending: true }),
  ]);

  if (pkgResult.error || acResult.error) {
    return NextResponse.json(
      { error: "Could not load pricing." },
      { status: 500 }
    );
  }

  const response: PricingResponse = {
    packages: (pkgResult.data || []).map((p) => ({
      ...p,
      retail_total: Number(p.retail_total),
      cost_total: Number(p.cost_total),
      gross_total: Number(p.gross_total),
    })),
    alacarte: (acResult.data || []).map((a) => ({
      ...a,
      retail: Number(a.retail),
      cost: Number(a.cost),
    })),
    tintUpgrade: TINT_UPGRADE,
  };

  return NextResponse.json(response);
}
