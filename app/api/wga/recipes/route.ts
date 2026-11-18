import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm } from "@/lib/session";
import { cleanRecipe, getRecipes, saveRecipes } from "@/lib/smRecipes";
import { shopLaborRates } from "@/lib/shopmonkey";

export const runtime = "nodejs";

// ShopMonkey ticket builds per package — White Glove staff only (pricing permission).
// Nothing here is ever part of a dealer response.

// GET → { recipes: { [itemId]: recipe }, rates: [{ name, rate }] }
export async function GET() {
  const s = await requireWgaPerm("pricing");
  if (!s) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  const [recipes, rates] = await Promise.all([getRecipes(), shopLaborRates()]);
  return NextResponse.json({ recipes, rates });
}

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();

// PUT { item_id, lines: [...] | [], everywhere?: boolean }
//   everywhere = also use it for the same-named package (same service name) at every other brand.
export async function PUT(req: Request) {
  const s = await requireWgaPerm("pricing");
  if (!s) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.item_id) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const cleaned = cleanRecipe(b);
  if ("error" in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });

  const { data: item } = await supabaseAdmin.from("dealer_service_items").select("id, name, service_id").eq("id", b.item_id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Package not found." }, { status: 404 });
  const ids = [item.id as string];
  if (b.everywhere) {
    const { data: svc } = await supabaseAdmin.from("dealer_services").select("name").eq("id", item.service_id).maybeSingle();
    const { data: services } = await supabaseAdmin.from("dealer_services").select("id, name").limit(2000);
    const sameSvc = (services || []).filter((x) => norm(x.name) === norm(svc?.name || "")).map((x) => x.id);
    if (sameSvc.length) {
      const { data: items } = await supabaseAdmin.from("dealer_service_items").select("id, name").in("service_id", sameSvc).limit(5000);
      for (const it of items || []) if (norm(it.name) === norm(item.name) && !ids.includes(it.id)) ids.push(it.id);
    }
  }
  const ok = await saveRecipes(ids, cleaned.recipe, s.userName || "WGA");
  if (!ok) return NextResponse.json({ error: "Could not save the build." }, { status: 500 });
  return NextResponse.json({ ok: true, applied: ids.length, recipe: cleaned.recipe });
}
