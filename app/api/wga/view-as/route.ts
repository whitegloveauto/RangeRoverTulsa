import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm, createSession, createHandoff, setSessionCookie, clearSessionCookie } from "@/lib/session";
import { hostOf, isLocalHost } from "@/lib/hosts";
import type { SessionClaims } from "@/lib/types";

export const runtime = "nodejs";

// POST { dealership_id, role: "admin" | "user" } — WGA admin opens the dealer side as that dealership.
// Issues a normal dealer session cookie (separate from the WGA cookie) tagged viewAs, so the
// dealer pages render exactly what the dealership sees. Orders placed while viewing are real.
export async function POST(req: Request) {
  const s = await requireWgaPerm("view_as");
  if (!s) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const role: "admin" | "user" = b.role === "user" ? "user" : "admin";
  let q = supabaseAdmin.from("dealer_dealerships").select("id, slug, name, brand, location, hide_cost_from_users, hostnames").eq("active", true);
  q = b.dealership_id ? q.eq("id", b.dealership_id) : q.order("name").limit(1);
  const { data } = await q;
  const d = data?.[0];
  if (!d) return NextResponse.json({ error: "Dealership not found." }, { status: 404 });

  const claims: SessionClaims = {
    kind: "dealer",
    dealershipId: d.id,
    slug: d.slug,
    name: d.name,
    brand: d.brand,
    location: d.location,
    userId: null,
    userName: `${s.userName} (WGA)`,
    userEmail: s.userEmail,
    role,
    canSeeCost: role === "admin" ? true : !d.hide_cost_from_users,
    viewAs: s.userName,
  };
  // Open the dealership's own address when it has one (the White Glove side lives on its own address).
  const here = hostOf(req.headers.get("x-forwarded-host") || req.headers.get("host"));
  const site = ((d.hostnames as string[] | null) || []).map(hostOf).find((h) => h && !isLocalHost(h));
  if (site && site !== here && !isLocalHost(here)) {
    const t = await createHandoff(claims);
    return NextResponse.json({ ok: true, next: `https://${site}/api/auth/handoff?t=${encodeURIComponent(t)}`, dealership: d.name, role });
  }
  setSessionCookie(await createSession(claims), "dealer");
  return NextResponse.json({ ok: true, next: "/portal/vehicle", dealership: d.name, role });
}

// DELETE — stop viewing as the dealership (clears only the dealer cookie)
export async function DELETE() {
  clearSessionCookie("dealer");
  return NextResponse.json({ ok: true });
}
