import type { Metadata, Viewport } from "next";
import "./globals.css";
import { currentTenant } from "@/lib/tenant";
import { DEFAULT_THEME, WGA_THEME } from "@/lib/theme";
import { headers } from "next/headers";
import ThemeStyle from "@/components/ThemeStyle";
import { dealerAppName, dealerIcons } from "@/lib/dealerIcons";

const isWgaPath = () => {
  const path = headers().get("x-pathname") || "";
  return path === "/wga" || path.startsWith("/wga/");
};

// Dealer pages get the dealership's name + car-brand icon (never WGA's mark); /wga gets White Glove's own.
export async function generateMetadata(): Promise<Metadata> {
  const wga = isWgaPath();
  if (wga) {
    return {
      title: "WGA Admin · Dealer Program",
      description: "Dealer pricing, quotes and orders from White Glove Auto.",
      applicationName: "WGA Admin",
      manifest: "/wga-manifest.json",
      icons: {
        icon: [{ url: "/wga-icon-192.png", sizes: "192x192", type: "image/png" }],
        apple: [{ url: "/wga-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      },
      appleWebApp: { capable: true, title: "WGA Admin", statusBarStyle: "black-translucent" },
      formatDetection: { telephone: false },
    };
  }
  const tenant = await currentTenant().catch(() => null);
  const ic = dealerIcons(tenant);
  const name = dealerAppName(tenant);
  return {
    title: `${name} · Dealer Portal`,
    description: "Protection pricing, quotes and orders.",
    applicationName: name,
    manifest: "/dealer-manifest",
    icons: {
      icon: [{ url: ic.favicon, sizes: "64x64", type: "image/png" }, { url: ic.i192, sizes: "192x192", type: "image/png" }],
      apple: [{ url: ic.apple, sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: { capable: true, title: name.length > 14 ? "Dealer Portal" : name, statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const wga = isWgaPath();
  const tenant = wga ? null : await currentTenant().catch(() => null);
  return {
    themeColor: wga ? WGA_THEME.bg : (tenant?.theme || DEFAULT_THEME).bg,
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme follows the dealership that owns this hostname; /wga always gets White Glove's own theme.
  const isWga = isWgaPath();
  const tenant = isWga ? null : await currentTenant().catch(() => null);
  const theme = isWga ? WGA_THEME : tenant?.theme || DEFAULT_THEME;
  return (
    <html lang="en">
      <head>
        <ThemeStyle theme={theme} />
      </head>
      <body>
        <div className="ambient" />
        {children}
      </body>
    </html>
  );
}
