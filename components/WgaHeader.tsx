"use client";

import Link from "next/link";
import SideMenu from "./SideMenu";
import WgaTheme from "./WgaTheme";
import { hasPerm } from "@/lib/perms";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

// White Glove Auto admin header.
export default function WgaHeader({ userName, role, perms = [] }: { userName: string; role: "admin" | "user"; perms?: string[] }) {
  const me = { role, perms };
  const router = useRouter();
  const path = usePathname();
  const [ctx, setCtx] = useState<{ dealerships: any[]; selected: any } | null>(null);
  useEffect(() => {
    fetch("/api/wga/context").then((r) => (r.ok ? r.json() : null)).then(setCtx).catch(() => {});
  }, []);
  async function switchDealer(id: string) {
    await fetch("/api/wga/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    window.location.reload();
  }

  async function signOut() {
    await fetch("/api/wga/auth/logout", { method: "POST" });
    router.push("/wga");
  }

  async function viewAsDealer() {
    const r = await fetch("/api/wga/view-as", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "admin" }) });
    const d = await r.json();
    if (r.ok) window.open(d.next, "_blank");
  }

  const links = [
    ...(hasPerm(me, "orders") ? [{ href: "/wga/orders", label: "Orders" }] : []),
    ...(hasPerm(me, "comebacks") ? [{ href: "/wga/comebacks", label: "Comebacks" }] : []),
    ...(hasPerm(me, "pricing") ? [{ href: "/wga/pricing", label: "Pricing" }] : []),
    ...(hasPerm(me, "vehicles") ? [{ href: "/wga/vehicles", label: "Vehicles" }] : []),
    ...(hasPerm(me, "dealerships") ? [{ href: "/wga/dealerships", label: "Dealerships" }] : []),
    ...(role === "admin" ? [{ href: "/wga/team", label: "Team" }] : []),
  ];

  return (
    <>
    <WgaTheme />
    <header className="app wga">
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wga-white.png" alt="White Glove Auto" style={{ height: 18, width: "auto", display: "block" }} />
          <span className="wga-eyebrow" style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--gold)", whiteSpace: "nowrap" }}>DEALER PROGRAM</span>
        </div>
        <nav className="nav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path?.startsWith(l.href) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="session">
        {ctx && ctx.dealerships.length > 0 ? (
          <label className="dealer-switch" title="Which dealership you're working on (pricing, vehicles, settings)">
            <select value={ctx.selected?.id || ""} onChange={(e) => switchDealer(e.target.value)}>
              {ctx.dealerships.map((d) => <option key={d.id} value={d.id}>{d.short_name || d.name}{d.active ? "" : " (inactive)"}</option>)}
            </select>
          </label>
        ) : null}
        {hasPerm(me, "view_as") ? <button className="signout" style={{ color: "var(--gold)" }} onClick={viewAsDealer} title="Open the dealer portal as the dealership sees it">View as dealership ↗</button> : null}
        <div className="acct" tabIndex={0}>
          <span className="pill role">{userName.split(" ")[0].toUpperCase()} · {role === "admin" ? "ADMIN" : "TEAM"} ▾</span>
          <div className="acct-menu">
            <div className="acct-name">{userName}</div>
            <Link href="/wga/pin">Change PIN</Link>
            <Link href="/wga/password">Change password</Link>
            <button onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>
      <SideMenu
        title="White Glove Auto"
        subtitle={`${userName} · ${role === "admin" ? "Admin" : "Team"}`}
        links={[...links, { href: "/wga/pin", label: "Change PIN" }, { href: "/wga/password", label: "Change password" }]}
        actions={[...(hasPerm(me, "view_as") ? [{ label: "View as dealership ↗", onClick: viewAsDealer, accent: true }] : []), { label: "Sign Out", onClick: signOut }]}
      />
    </header>
    </>
  );
}
