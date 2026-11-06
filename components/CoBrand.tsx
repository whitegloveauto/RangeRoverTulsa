"use client";

import { useEffect, useState } from "react";

// Co-brand lockup: dealership brand badge (left) · divider · White Glove Auto (right).
// Brand comes from the session when signed in, otherwise from the hostname (/api/tenant).
export default function CoBrand({ size = "header", logoUrl, brandName }: { size?: "header" | "login"; logoUrl?: string | null; brandName?: string | null }) {
  const [logo, setLogo] = useState<string | null>(logoUrl || null);
  const [name, setName] = useState<string>(brandName || "");
  useEffect(() => {
    if (logoUrl) {
      setLogo(logoUrl);
      setName(brandName || "");
      return;
    }
    fetch("/api/tenant").then((r) => (r.ok ? r.json() : null)).then((t) => {
      if (t?.brand) {
        setLogo(t.brand.logo_url);
        setName(t.brand.name);
      }
    }).catch(() => {});
  }, [logoUrl, brandName]);

  const h = size === "login" ? 56 : 30;
  const wgaHeight = size === "login" ? 30 : 16;
  const gap = size === "login" ? 28 : 16;
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={name || "Dealership"} style={{ height: h, width: "auto", maxWidth: h * 3.2, objectFit: "contain", display: "block" }} />
      ) : (
        <span style={{ height: h, display: "inline-block" }} />
      )}
      <div style={{ width: 1, height: h * 0.7, background: "var(--stroke)" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/wga-white.png" alt="White Glove Auto" style={{ height: wgaHeight, width: "auto", display: "block" }} />
    </div>
  );
}
