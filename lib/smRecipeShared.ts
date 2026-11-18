// Client-safe half of the ShopMonkey ticket builds: the shapes and the price preview.
// (lib/smRecipes.ts holds the storage and must stay server-only — it reaches the database.)

export interface SmRecipeLine {
  kind: "labor" | "material";
  name: string;
  qty: number; // labor: hours · material: quantity
  price: number | null; // labor: $/hour (null = the shop's default labor rate) · material: $ each. Ignored on the balance line.
  cost?: number | null; // material only: White Glove's own cost each (ShopMonkey "wholesale")
  part_number?: string | null; // material only
  balance?: boolean; // this line absorbs the difference
}
export interface SmRecipe {
  lines: SmRecipeLine[];
  updated_at?: string;
  updated_by?: string;
}

// How a build lands on one dealer price (dollars). Mirrors the ticket builder, for the editor's preview.
// defaultRate = the shop's default labor rate ($/hour) for labor lines without their own rate.
export function previewRecipe(recipe: SmRecipe, price: number, defaultRate: number) {
  const cents = (n: number) => Math.round(n * 100);
  const T = cents(price);
  let fixed = 0;
  const out = recipe.lines.map((l) => {
    if (l.balance) return { ...l, unit: 0, total: 0 };
    const unit = cents(l.kind === "labor" ? l.price ?? defaultRate : l.price ?? 0);
    const total = Math.round(unit * l.qty);
    fixed += total;
    return { ...l, unit: unit / 100, total: total / 100 };
  });
  const rem = T - fixed;
  const bi = recipe.lines.findIndex((l) => l.balance);
  let discount = 0;
  if (bi >= 0) {
    const q = recipe.lines[bi].qty;
    const unit = rem > 0 ? Math.ceil(rem / q) : 0;
    const total = Math.round(unit * q);
    out[bi] = { ...out[bi], unit: unit / 100, total: total / 100 };
    discount = Math.max(0, fixed + total - T);
  }
  return { lines: out, discount: discount / 100, over: rem < 0 ? -rem / 100 : 0 };
}
