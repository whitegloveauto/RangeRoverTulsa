import { currentTenant } from "@/lib/tenant";
import { DEFAULT_THEME } from "@/lib/theme";
import { dealerAppName, dealerIcons } from "@/lib/dealerIcons";

export const dynamic = "force-dynamic";

// Web app manifest for the dealership side — named and iconed for the dealership that owns this hostname.
export async function GET() {
  const t = await currentTenant().catch(() => null);
  const ic = dealerIcons(t);
  const name = dealerAppName(t);
  const bg = (t?.theme || DEFAULT_THEME).bg;
  const body = {
    name: `${name} · Dealer Portal`,
    short_name: name.length > 14 ? "Dealer Portal" : name,
    description: "Protection pricing, quotes and orders.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: bg,
    theme_color: bg,
    icons: [
      { src: ic.i192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ic.i512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ic.maskable, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } });
}
