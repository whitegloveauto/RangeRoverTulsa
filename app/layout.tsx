import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WGA Dealer Program",
  description: "Range Rover Tulsa dealer pricing, quotes and orders from White Glove Auto.",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="ambient" />
        {children}
      </body>
    </html>
  );
}
