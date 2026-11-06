"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import CoBrand from "./CoBrand";
import SideMenu from "./SideMenu";
import { themeCss } from "@/lib/theme";

// Dealership-side header with navigation. Settings only shows for dealer admins.
export default function AppHeader({
  dealershipName,
  role,
  userName,
}: {
  dealershipName: string;
  role?: "admin" | "user";
  userName?: string;
}) {
  const router = useRouter();
  const path = usePathname();
  const [viewAs, setViewAs] = useState<string | null>(null);
  const [brand, setBrand] = useState<{ logo_url: string; name: string } | null>(null);
  const [themeStyle, setThemeStyle] = useState<string>("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setViewAs(d?.viewAs || null);
        if (d?.brand) setBrand(d.brand);
        // the signed-in dealership's theme wins over the hostname's (matters for WGA "view as")
        if (d?.theme) setThemeStyle(themeCss(d.theme));
      })
      .catch(() => {});
  }, []);

  async function exitViewAs() {
    await fetch("/api/wga/view-as", { method: "DELETE" });
    router.push("/wga/dealerships");
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const links = [
    { href: "/portal/vehicle", label: "New Quote" },
    { href: "/portal/orders", label: "Orders" },
    { href: "/portal/master", label: "Master Sheet" },
    { href: "/portal/comebacks", label: "Comebacks" },
    ...(role === "admin" ? [{ href: "/portal/settings", label: "Settings" }] : []),
  ];

  return (
    <>
    {themeStyle ? <style dangerouslySetInnerHTML={{ __html: themeStyle }} /> : null}
    {viewAs ? (
      <div className="viewas-bar">
        <span>Viewing as <b>{dealershipName}</b> · {role === "admin" ? "dealer admin" : "sales user"} · signed in as {viewAs} (WGA). {role === "admin" ? "You can change their retail prices, team logins and cost visibility under Settings on their behalf." : "This is exactly what their sales users see."} Orders you submit are real.</span>
        <button onClick={exitViewAs}>Exit dealer view</button>
      </div>
    ) : null}
    <header className="app">
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <CoBrand size="header" logoUrl={brand?.logo_url} brandName={brand?.name} />
        <nav className="nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path?.startsWith(l.href) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="session">
        {userName ? <span className="pill role">{userName.toUpperCase()}</span> : null}
        <span className="pill">{dealershipName.toUpperCase()}</span>
        <button className="signout" onClick={signOut}>
          Sign Out
        </button>
      </div>
      <SideMenu
        title={dealershipName}
        subtitle={userName ? `${userName} · ${role === "admin" ? "Dealer admin" : "Sales"}` : undefined}
        links={links}
        actions={[...(viewAs ? [{ label: "Exit dealer view", onClick: exitViewAs, accent: true }] : []), { label: "Sign Out", onClick: signOut }]}
      />
    </header>
    </>
  );
}
