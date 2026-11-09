import { kvGet, kvSet } from "./kv";
import { PPF_RE, DEFAULT_PPF_GROUP } from "./serviceGroups";

// "What's included" for each package — printed on the customer's quote, packet and price sheet.
// WGA can write its own wording per package (Pricing → Quote document); until then the standard
// PPF packages use the wording below. Stored per brand catalog as { itemId: text }.

const STANDARD_PPF: [RegExp, string][] = [
  [/partial front/i, "Full front bumper, headlights, fog lights, about a third of the hood, about a third of the front fenders, and side mirrors."],
  [/track ?pack/i, "Full front bumper, headlights, fog lights, full hood, full front fenders, side mirrors, and rocker panels."],
  [/full front/i, "Full front bumper, headlights, fog lights, full hood, full front fenders, and side mirrors."],
  [/full body|whole (car|vehicle)|full (car|vehicle)|entire (car|vehicle)/i, "Every painted panel on the vehicle — all painted surfaces, excluding trim."],
];

const key = (brand: string) => `coverage:${brand}`;

export async function getCoverageOverrides(brand: string): Promise<Record<string, string>> {
  return kvGet<Record<string, string>>(key(brand), {});
}

export async function setCoverage(brand: string, itemId: string, text: string) {
  const o = await getCoverageOverrides(brand);
  const t = text.trim().slice(0, 600);
  if (t) o[itemId] = t;
  else delete o[itemId];
  return kvSet(key(brand), o);
}

export function isPpfService(s: { key?: string | null; name: string; product_name?: string | null; group?: string | null }) {
  return s.group === DEFAULT_PPF_GROUP || PPF_RE.test(`${s.key || ""} ${s.name} ${s.product_name || ""}`);
}

export function standardCoverage(svc: { key?: string | null; name: string; product_name?: string | null; group?: string | null }, itemName: string): string | null {
  if (!isPpfService(svc)) return null;
  for (const [re, text] of STANDARD_PPF) if (re.test(itemName)) return text;
  return null;
}

// WGA's own wording → standard PPF wording → the package's short description → nothing.
export function coverageFor(
  item: { id: string; name: string; description?: string | null },
  svc: { key?: string | null; name: string; product_name?: string | null; group?: string | null },
  overrides: Record<string, string>
): string | null {
  return overrides[item.id] || standardCoverage(svc, item.name) || item.description || null;
}

// "What's included" for the lines on a saved quote/order: { item_id: text }.
export async function lineCoverage(brand: string, lines: { item_id: string; name: string; service: string }[]): Promise<Record<string, string>> {
  const { supabaseAdmin } = await import("./supabase");
  const { getGroupOverrides, groupFor } = await import("./serviceGroups");
  const ids = lines.map((l) => l.item_id).filter(Boolean);
  if (!ids.length) return {};
  const [{ data: items }, { data: services }, overrides, groups] = await Promise.all([
    supabaseAdmin.from("dealer_service_items").select("id, service_id, description").in("id", ids),
    supabaseAdmin.from("dealer_services").select("id, key, name, product_name").eq("brand", brand),
    getCoverageOverrides(brand),
    getGroupOverrides(brand),
  ]);
  const byId = new Map((items || []).map((i: any) => [i.id, i]));
  const out: Record<string, string> = {};
  for (const l of lines) {
    const it: any = byId.get(l.item_id) || {};
    const s: any = (services || []).find((x: any) => x.id === it.service_id) || (services || []).find((x: any) => x.name === l.service) || { name: l.service };
    const c = coverageFor({ id: l.item_id, name: l.name, description: it.description }, { ...s, group: s.id ? groupFor(s, groups) : null }, overrides);
    if (c) out[l.item_id] = c;
  }
  return out;
}
