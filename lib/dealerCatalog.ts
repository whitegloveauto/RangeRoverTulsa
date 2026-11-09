import { kvGet, kvSet } from "@/lib/kv";

// Which catalog rows a dealership offers. The year/model/trim list itself is per manufacturer
// (dealer_vehicles.brand); each dealership can hide trims it doesn't sell. Stored per dealership
// in dealer_program_settings (vehicles:<id>) — no schema change.
export interface DealerCatalogPrefs {
  hidden: string[]; // dealer_vehicles ids hidden at this dealership
}
const key = (id: string) => `vehicles:${id}`;

export async function getHiddenVehicles(dealershipId: string | null | undefined): Promise<Set<string>> {
  if (!dealershipId) return new Set();
  const p = await kvGet<Partial<DealerCatalogPrefs>>(key(dealershipId), {});
  return new Set(Array.isArray(p.hidden) ? p.hidden : []);
}

export async function setHiddenVehicles(dealershipId: string, ids: string[], hidden: boolean) {
  const cur = await getHiddenVehicles(dealershipId);
  for (const id of ids) hidden ? cur.add(id) : cur.delete(id);
  return kvSet(key(dealershipId), { hidden: Array.from(cur) });
}
