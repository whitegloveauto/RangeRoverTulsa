"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { DealerAccess } from "@/lib/dealerAccess";

export interface DealerSessionInfo {
  dealership: { name: string; brand: string; location: string | null; short_name?: string };
  brand?: { key: string; name: string; make: string; logo_url: string; logo_paper_url?: string; tagline: string | null } | null;
  user: { id?: string | null; name: string; email: string; role: "admin" | "user"; canSeeCost: boolean; access?: DealerAccess };
  viewAs?: string | null;
  needsSetup?: boolean;
}

export const SETUP_SKIP_KEY = "wga-setup-skip";

// Loads the dealer session; redirects to the login page when there isn't one, and sends a
// dealer admin who hasn't done first-time setup to /portal/setup (unless they chose "later" this visit).
export function useDealerSession() {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState<DealerSessionInfo | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (r) => {
        if (!r.ok) {
          router.replace("/");
          return;
        }
        const d: DealerSessionInfo = await r.json();
        let skipped = false;
        try {
          skipped = sessionStorage.getItem(SETUP_SKIP_KEY) === "1";
        } catch {}
        if (d.needsSetup && !skipped && path && !path.startsWith("/portal/setup") && !path.startsWith("/portal/password")) {
          router.replace("/portal/setup");
          return;
        }
        setSession(d);
        setReady(true);
      })
      .catch(() => router.replace("/"));
  }, [router, path]);
  return { session, ready };
}

export interface WgaSessionInfo {
  user: { name: string; email: string; role: "admin" | "user"; perms: string[] };
  mustChangePassword: boolean;
  hasPin: boolean;
}

// Loads the WGA session; redirects to sign-in when there isn't one, and forces
// the first-sign-in steps (change password → set PIN) before anything else.
// Pass { gate: false } on the password/PIN pages themselves.
export function useWgaSession(opts: { gate?: boolean } = {}) {
  const gate = opts.gate !== false;
  const router = useRouter();
  const [session, setSession] = useState<WgaSessionInfo | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch("/api/wga/auth/session")
      .then(async (r) => {
        if (!r.ok) {
          router.replace("/wga");
          return;
        }
        const d: WgaSessionInfo = await r.json();
        if (gate && d.mustChangePassword) {
          router.replace("/wga/password?first=1");
          return;
        }
        if (gate && !d.hasPin) {
          router.replace("/wga/pin?setup=1");
          return;
        }
        setSession(d);
        setReady(true);
      })
      .catch(() => router.replace("/wga"));
  }, [router, gate]);
  return { session, ready };
}
