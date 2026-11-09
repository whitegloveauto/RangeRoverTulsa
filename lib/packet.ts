import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { tenantByDealershipId } from "@/lib/tenant";
import { lineCoverage } from "@/lib/coverage";

// Everything the quote document needs (components/QuoteDocument), assembled server-side.
export interface PacketData {
  quote: {
    id: string;
    quote_number: string;
    vehicle_year: number;
    vehicle_model: string;
    vehicle_trim: string;
    vehicle_vin: string | null;
    stock_number: string | null;
    customer_name: string | null;
    retail_total: number;
    created_at: string;
    submitted_at: string | null;
  };
  dealership: { id: string; name: string; location: string | null };
  lines: { item_id: string; service: string; name: string; retail: number; description: string | null; coverage: string | null; blurb: string | null }[];
  services: { id: string; name: string; product_name: string | null; blurb: string | null; facts: string[] }[];
  imageUrl: string | null;
  preparedBy: string | null;
  brand: { name: string; make: string; logo_url: string };
}

export async function loadPacket(where: { id?: string; token?: string; dealershipId?: string }): Promise<PacketData | null> {
  let q = supabaseAdmin
    .from("dealer_quotes")
    .select("id, quote_number, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, stock_number, customer_name, retail_total, created_at, submitted_at, line_items, dealer_user_name, dealership_id, dealer_dealerships(name, location, brand)");
  if (where.token) q = q.eq("packet_token", where.token);
  else if (where.id) q = q.eq("id", where.id);
  else return null;
  if (where.dealershipId) q = q.eq("dealership_id", where.dealershipId);
  const { data: qr } = await q.maybeSingle();
  if (!qr) return null;
  const d: any = qr.dealer_dealerships;
  const brand = d?.brand || "Range Rover";
  const lineItems: any[] = Array.isArray(qr.line_items) ? qr.line_items : [];
  const itemIds = lineItems.map((l) => l.item_id).filter(Boolean);

  const tenant = await tenantByDealershipId(qr.dealership_id).catch(() => null);
  const [{ data: items }, { data: services }, { data: img }, coverage] = await Promise.all([
    itemIds.length ? supabaseAdmin.from("dealer_service_items").select("id, description, blurb").in("id", itemIds) : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from("dealer_services").select("id, name, product_name, blurb, facts, sort_order").eq("brand", brand).order("sort_order"),
    supabaseAdmin.from("dealer_model_images").select("image_url").eq("brand", brand).eq("model", qr.vehicle_model).maybeSingle(),
    lineCoverage(brand, lineItems),
  ]);
  const byId = new Map((items || []).map((i: any) => [i.id, i]));
  const lines = lineItems.map((l) => {
    const it: any = byId.get(l.item_id) || {};
    return { item_id: l.item_id, service: l.service, name: l.name, retail: Number(l.retail ?? 0), description: it.description ?? null, coverage: coverage[l.item_id] || null, blurb: it.blurb ?? null };
  });
  const usedServiceNames = new Set(lines.map((l) => l.service));
  const svc = (services || []).filter((s: any) => usedServiceNames.has(s.name)).map((s: any) => ({ id: s.id, name: s.name, product_name: s.product_name, blurb: s.blurb, facts: s.facts || [] }));

  return {
    quote: { id: qr.id, quote_number: qr.quote_number, vehicle_year: qr.vehicle_year, vehicle_model: qr.vehicle_model, vehicle_trim: qr.vehicle_trim, vehicle_vin: qr.vehicle_vin || null, stock_number: qr.stock_number, customer_name: qr.customer_name, retail_total: Number(qr.retail_total ?? 0), created_at: qr.created_at, submitted_at: qr.submitted_at },
    dealership: { id: qr.dealership_id, name: d?.name || "Dealership", location: d?.location || null },
    lines,
    services: svc,
    imageUrl: img?.image_url || null,
    preparedBy: qr.dealer_user_name || null,
    brand: { name: tenant?.brand.name || brand, make: tenant?.brand.make || brand, logo_url: tenant?.brand.logo_paper_url || tenant?.brand.logo_url || "" },
  };
}

// Returns (creating if needed) the unguessable token for a quote's public packet link.
export async function ensurePacketToken(quoteId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("dealer_quotes").select("packet_token").eq("id", quoteId).maybeSingle();
  if (!data) return null;
  if (data.packet_token) return data.packet_token;
  const token = randomBytes(18).toString("base64url");
  const { error } = await supabaseAdmin.from("dealer_quotes").update({ packet_token: token }).eq("id", quoteId);
  return error ? null : token;
}
