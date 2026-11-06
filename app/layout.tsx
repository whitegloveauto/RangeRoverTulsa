import type { Metadata, Viewport } from "next";
import "./globals.css";
import { currentTenant } from "@/lib/tenant";
import { DEFAULT_THEME } from "@/lib/theme";
import ThemeStyle from "@/components/ThemeStyle";

export const metadata: Metadata = {
  title: "WGA Dealer Program",
  description: "Dealer pricing, quotes and orders from White Glove Auto.",
  applicationName: "WGA Dealer",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/favicon-64.png", sizes: "64x64", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "WGA Dealer",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0C1A14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme follows the dealership that owns this hostname; WGA pages override it client-side.
  const tenant = await currentTenant().catch(() => null);
  const theme = tenant?.theme || DEFAULT_THEME;
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
