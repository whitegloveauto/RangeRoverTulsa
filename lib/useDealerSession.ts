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
}

export function useWgaSession() {
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
        setSession(await r.json());
        setReady(true);
      })
      .catch(() => router.replace("/wga"));
  }, [router]);
  return { session, ready };
}
