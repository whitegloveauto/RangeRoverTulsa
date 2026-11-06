"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// White Glove Auto admin header.
export default function WgaHeader({ userName, role }: { userName: string; role: "admin" | "user" }) {
  const router = useRouter();
  const path = usePathname();

  async function signOut() {
    await fetch("/api/wga/auth/logout", { method: "POST" });
    router.push("/wga");
  }

  const links = [
    { href: "/wga/orders", label: "Orders" },
    ...(role === "admin"
      ? [
          { href: "/wga/pricing", label: "Pricing" },
          { href: "/wga/vehicles", label: "Vehicles" },
          { href: "/wga/dealerships", label: "Dealerships" },
        ]
      : []),
  ];

  return (
    <header className="app">
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wga-white.png" alt="White Glove Auto" style={{ height: 18, width: "auto", display: "block" }} />
          <span style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--gold)" }}>DEALER PROGRAM · ADMIN</span>
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
        <span className="pill role">{userName.toUpperCase()}</span>
        <span className="pill">{role === "admin" ? "ADMIN" : "TEAM"}</span>
        <Link href="/wga/pin" className="signout" title="Change PIN">PIN</Link>
        <Link href="/wga/password" className="signout" title="Change password">Password</Link>
        <button className="signout" onClick={signOut}>
          Sign Out
        </button>
      </div>
    </header>
  );
}
