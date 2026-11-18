import { kvGet, kvSet } from "./kv";

// ShopMonkey "build" for a package: the labor and material lines the RO service gets when a dealer
// orders it. White Glove only — never sent to a dealership.
//
// A package's dealer price changes by model, so exactly one line "absorbs the difference": every
// other line is fixed (hours × rate, quantity × price) and that one line is priced at whatever is
// left, so the service always totals the dealer price. If the fixed lines alone are more than the
// dealer price, the ticket builder lands the price with a discount on the service.
//
// Stored as one JSON map in dealer_program_settings (key "sm-recipes"): { [itemId]: SmRecipe }.
// The dealer-order-sm edge function reads the same key.

import type { SmRecipe, SmRecipeLine } from "./smRecipeShared";
export type { SmRecipe, SmRecipeLine } from "./smRecipeShared";

export const SM_RECIPES_KEY = "sm-recipes";
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export async function getRecipes(): Promise<Record<string, SmRecipe>> {
  return kvGet<Record<string, SmRecipe>>(SM_RECIPES_KEY, {});
}

// Clean + check what the editor sent. Returns the recipe (null = no build: one line at the dealer price) or an error.
export function cleanRecipe(input: any): { recipe: SmRecipe | null } | { error: string } {
  const raw: any[] = Array.isArray(input?.lines) ? input.lines : [];
  if (!raw.length) return { recipe: null };
  if (raw.length > 20) return { error: "A build can have up to 20 lines." };
  const lines: SmRecipeLine[] = [];
  for (const [i, l] of raw.entries()) {
    const kind = l?.kind === "labor" ? "labor" : l?.kind === "material" ? "material" : null;
    const name = String(l?.name || "").trim().slice(0, 120);
    const qty = num(l?.qty);
    const balance = !!l?.balance;
    if (!kind) return { error: `Line ${i + 1}: pick labor or material.` };
    if (!name) return { error: `Line ${i + 1} needs a name.` };
    if (!(qty > 0) || qty > 10000) return { error: `"${name}" needs ${kind === "labor" ? "hours" : "a quantity"} above zero.` };
    const p = num(l?.price);
    const price = balance || Number.isNaN(p) ? null : p;
    if (price !== null && (price < 0 || price > 100000)) return { error: `"${name}" has a price that doesn't look right.` };
    if (kind === "material" && !balance && price === null) return { error: `"${name}" needs a price each (use 0 for a no-charge line), or make it the line that absorbs the difference.` };
    const line: SmRecipeLine = { kind, name, qty: Math.round(qty * 100) / 100, price: price === null ? null : Math.round(price * 100) / 100 };
    if (kind === "material") {
      const c = num(l?.cost);
      if (!Number.isNaN(c) && c >= 0 && c <= 100000) line.cost = Math.round(c * 100) / 100;
      const pn = String(l?.part_number || "").trim().slice(0, 60);
      if (pn) line.part_number = pn;
    }
    if (balance) line.balance = true;
    lines.push(line);
  }
  const b = lines.filter((l) => l.balance).length;
  if (b !== 1) return { error: "Pick exactly one line to absorb the difference, so the ticket always totals the dealer price." };
  return { recipe: { lines } };
}

export async function saveRecipes(itemIds: string[], recipe: SmRecipe | null, by: string): Promise<boolean> {
  const all = await getRecipes();
  for (const id of itemIds) {
    if (recipe) all[id] = { ...recipe, updated_at: new Date().toISOString(), updated_by: by };
    else delete all[id];
  }
  return kvSet(SM_RECIPES_KEY, all);
}
