"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [viewAs, setViewAs] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setViewAs(d?.viewAs || null))
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
    ...(role === "admin" ? [{ href: "/portal/settings", label: "Settings" }] : []),
  ];

  return (
    <>
    {viewAs ? (
      <div className="viewas-bar">
        <span>Viewing as <b>{dealershipName}</b> · {role === "admin" ? "dealer admin" : "sales user"} · signed in as {viewAs} (WGA). {role === "admin" ? "You can change their retail prices, team logins and cost visibility under Settings on their behalf." : "This is exactly what their sales users see."} Orders you submit are real.</span>
        <button onClick={exitViewAs}>Exit dealer view</button>
      </div>
    ) : null}
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
    </>
  );
}
