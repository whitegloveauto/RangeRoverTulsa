"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

export interface MenuLink {
  href: string;
  label: string;
}
export interface MenuAction {
  label: string;
  onClick: () => void;
  accent?: boolean;
}

// Hamburger + slide-in drawer. Only rendered at phone widths (CSS hides it on desktop,
// where the same links live in the top bar).
export default function SideMenu({ title, subtitle, links, actions }: { title: string; subtitle?: string; links: MenuLink[]; actions: MenuAction[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const path = usePathname();
  useEffect(() => setMounted(true), []);

  // close on route change / escape, lock scroll while open
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // The drawer is portaled to <body>: the header uses backdrop-filter, which would
  // otherwise trap position:fixed children inside its own stacking context.
  const drawer = (
    <>
      <div className={"drawer-bg" + (open ? " open" : "")} onClick={() => setOpen(false)} />
      <aside className={"drawer" + (open ? " open" : "")} aria-hidden={!open}>
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{title}</div>
            {subtitle ? <div className="drawer-sub">{subtitle}</div> : null}
          </div>
          <button className="drawer-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
        </div>
        <nav className="drawer-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path?.startsWith(l.href) ? "active" : ""} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="drawer-actions">
          {actions.map((a) => (
            <button key={a.label} className={a.accent ? "accent" : ""} onClick={() => { setOpen(false); a.onClick(); }}>
              {a.label}
            </button>
          ))}
        </div>
      </aside>
    </>
  );

  return (
    <div className="sidemenu-root">
      <button className="hamburger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(true)}>
        <span /><span /><span />
      </button>
      {mounted ? createPortal(drawer, document.body) : null}
    </div>
  );
}
