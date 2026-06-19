import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealership Pricing Portal — White Glove Auto",
  description:
    "Authorized dealership access to XPEL paint protection, ceramic coating, and window film pricing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="ambient" />
        {children}
      </body>
    </html>
  );
}
