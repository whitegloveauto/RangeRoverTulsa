import { supabaseAdmin } from "./supabase";
import type { PricingBook, DealerService, DealerServiceItem, ModelPrice } from "./types";
import { getHiddenVehicles } from "./dealerCatalog";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

// Assemble the full pricing book. Catalog (services, packages, models) is per BRAND;
// WGA cost / suggested retail is per DEALERSHIP; the dealership's own retail overlays suggested.
export async function loadPricingBook(opts: {
  brand: string;
  dealershipId?: string | null;
  canSeeCost: boolean;
  includeInactive?: boolean;
}): Promise<PricingBook> {
  const { brand, dealershipId, canSeeCost, includeInactive } = opts;

  const [svcRes, itemRes, modelRes, priceRes, retailRes, hidden] = await Promise.all([
    supabaseAdmin.from("dealer_services").select("*").eq("brand", brand).order("sort_order"),
    supabaseAdmin.from("dealer_service_items").select("*").order("sort_order"),
    supabaseAdmin.from("dealer_vehicles").select("id, model, sort_order").eq("brand", brand).eq("active", true).order("sort_order"),
    dealershipId
      ? supabaseAdmin.from("dealer_model_pricing").select("model, item_id, cost, suggested_retail").eq("dealership_id", dealershipId)
      : Promise.resolve({ data: [] as any[], error: null }),
    dealershipId
      ? supabaseAdmin.from("dealer_retail_prices").select("model, item_id, retail").eq("dealership_id", dealershipId)
      : Promise.resolve({ data: [] as any[], error: null }),
    getHiddenVehicles(dealershipId),
  ]);

  const services = ((svcRes.data || []) as DealerService[]).filter((s) => includeInactive || s.active);
  const svcIds = new Set(services.map((s) => s.id));
  const items = ((itemRes.data || []) as DealerServiceItem[]).filter(
    (i) => svcIds.has(i.service_id) && (includeInactive || i.active)
  );

  // Distinct models in catalog order
  const seen = new Set<string>();
  const models: string[] = [];
  for (const r of modelRes.data || []) {
    if (hidden.has(r.id)) continue; // a model drops off a dealership's grid once every trim is hidden there
    if (!seen.has(r.model)) {
      seen.add(r.model);
      models.push(r.model);
    }
  }

  const prices: Record<string, Record<string, ModelPrice>> = {};
  for (const m of models) {
    prices[m] = {};
    for (const it of items) prices[m][it.id] = { cost: null, suggested_retail: null, retail: null };
  }
  for (const p of priceRes.data || []) {
    const cell = prices[p.model]?.[p.item_id];
    if (!cell) continue;
    cell.cost = num(p.cost);
    cell.suggested_retail = num(p.suggested_retail);
    cell.retail = cell.suggested_retail;
  }
  for (const r of retailRes.data || []) {
    const cell = prices[r.model]?.[r.item_id];
    if (!cell) continue;
    const v = num(r.retail);
    if (v !== null) cell.retail = v;
  }
  if (!canSeeCost) {
    for (const m of models) for (const k of Object.keys(prices[m])) prices[m][k].cost = null;
  }

  return {
    brand,
    models,
    services: services.map((s) => ({ ...s, items: items.filter((i) => i.service_id === s.id) })),
    prices,
    canSeeCost,
  };
}
