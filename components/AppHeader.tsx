"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import CoBrand from "./CoBrand";

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

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  const links = [
    { href: "/portal/vehicle", label: "New Quote" },
    { href: "/portal/orders", label: "Orders" },
    { href: "/portal/master", label: "Master Sheet" },
    ...(role === "admin" ? [{ href: "/portal/settings", label: "Settings" }] : []),
  ];

  return (
    <header className="app">
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <CoBrand size="header" />
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
    </header>
  );
}
