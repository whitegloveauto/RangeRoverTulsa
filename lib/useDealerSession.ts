"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface DealerSessionInfo {
  dealership: { name: string; brand: string; location: string | null };
  user: { name: string; email: string; role: "admin" | "user"; canSeeCost: boolean };
}

// Loads the dealer session; redirects to the login page when there isn't one.
export function useDealerSession() {
  const router = useRouter();
  const [session, setSession] = useState<DealerSessionInfo | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch("/api/auth/session")
      .then(async (r) => {
        if (!r.ok) {
          router.replace("/");
          return;
        }
        setSession(await r.json());
        setReady(true);
      })
      .catch(() => router.replace("/"));
  }, [router]);
  return { session, ready };
}

export interface WgaSessionInfo {
  user: { name: string; email: string; role: "admin" | "user" };
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
