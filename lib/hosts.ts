// Which web address serves what.
//   • The White Glove admin side lives on its own address: dealers.whitegloveauto.app.
//   • Each dealership has its own address(es) in dealer_dealerships.hostnames
//     (lrt.whitegloveauto.app = Land Rover Tulsa).
// Edge-safe (used by middleware): no server imports here.

export const WGA_HOST = (process.env.NEXT_PUBLIC_WGA_HOST || "dealers.whitegloveauto.app").toLowerCase();
// Once WGA_HOST is live (DNS + Netlify domain alias), NEXT_PUBLIC_WGA_SPLIT=1 sends any /wga visit on
// a dealership's address over to WGA_HOST. Until then /wga keeps working everywhere.
export const WGA_SPLIT = process.env.NEXT_PUBLIC_WGA_SPLIT === "1";

export const hostOf = (h: string | null | undefined) => (h || "").toLowerCase().split(",")[0].trim().split(":")[0];
export const isWgaHost = (h: string | null | undefined) => hostOf(h) === WGA_HOST;
export const isLocalHost = (h: string | null | undefined) => /^(localhost|127\.|0\.0\.0\.0)/.test(hostOf(h)) || hostOf(h).endsWith(".netlify.app");
export const wgaOrigin = () => `https://${WGA_HOST}`;
