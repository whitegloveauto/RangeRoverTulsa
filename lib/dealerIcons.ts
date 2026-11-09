import { shippedLogoKey } from "./brandLogo";
import type { Tenant } from "./tenant";

// Home-screen / tab icons for the dealership side: the car brand's logo (public/brand-icons),
// or a plain shield. Never White Glove Auto's mark.
export function dealerIcons(t: Tenant | null) {
  const k = t ? shippedLogoKey(t.brand.key, t.brand.make, t.brand.name, t.dealership.brand) : null;
  const p = `/brand-icons/${k || "dealer"}`;
  return { favicon: `${p}-64.png`, apple: `${p}-180.png`, i192: `${p}-192.png`, i512: `${p}-512.png`, maskable: `${p}-512-maskable.png` };
}

export const dealerAppName = (t: Tenant | null) => (t ? `${t.dealership.short_name || t.dealership.name}` : "Dealer Portal");
