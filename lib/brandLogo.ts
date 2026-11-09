// Manufacturer logos shipped with the app (public/brands):
//   /brands/<key>.png        — tuned to read on dark backgrounds (portal header, login, brand tiles)
//   /brands/<key>-color.png  — the manufacturer's standard full-colour logo, for white paper
//                              (customer packet, quote letterhead, printed price sheets)
// A brand gets these automatically when its key, make or name matches; a logo uploaded on
// the brand (or set on a dealership) still wins for on-screen use.

export const SHIPPED_LOGOS = new Set<string>(["acura","alfa-romeo","aston-martin","audi","bentley","bmw","buick","cadillac","chevrolet","chrysler","dodge","ferrari","fiat","ford","genesis","gmc","honda","hyundai","infiniti","jaguar","jeep","kia","lamborghini","land-rover","lexus","lincoln","lucid","maserati","mazda","mclaren","mercedes-benz","mini","mitsubishi","nissan","polestar","porsche","ram","rivian","rolls-royce","subaru","tesla","toyota","volkswagen","volvo"]);

const ALIASES: Record<string, string> = {
  mercedes: "mercedes-benz", "mercedes-amg": "mercedes-benz", benz: "mercedes-benz", vw: "volkswagen", chevy: "chevrolet",
  landrover: "land-rover", "range-rover": "land-rover", jlr: "land-rover", alfa: "alfa-romeo", rolls: "rolls-royce",
  "rolls-royce-motor-cars": "rolls-royce", aston: "aston-martin", "mini-cooper": "mini", "ram-trucks": "ram",
  "genesis-motor": "genesis", "mitsubishi-motors": "mitsubishi", "gmc-trucks": "gmc", "alfa-romeo-fiat": "alfa-romeo",
};

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function shippedLogoKey(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const s = slug(c);
    if (SHIPPED_LOGOS.has(s)) return s;
    if (ALIASES[s]) return ALIASES[s];
    const first = s.split("-")[0];
    if (SHIPPED_LOGOS.has(first)) return first;
    if (ALIASES[first]) return ALIASES[first];
  }
  return null;
}

const isPlaceholder = (u?: string | null) => !u || /\/wga-(white|black)\.png$/.test(u);

// { screen: for dark UI, paper: for white documents }
export function brandLogos(b: { key?: string | null; make?: string | null; name?: string | null; logo_light_url?: string | null } | null | undefined, dealershipLogo?: string | null) {
  const k = shippedLogoKey(b?.key, b?.make, b?.name);
  const uploaded = !isPlaceholder(dealershipLogo) ? dealershipLogo! : !isPlaceholder(b?.logo_light_url) ? b!.logo_light_url! : null;
  return {
    screen: uploaded || (k ? `/brands/${k}.png` : "/wga-white.png"),
    paper: k ? `/brands/${k}-color.png` : uploaded || "/wga-black.png",
  };
}
