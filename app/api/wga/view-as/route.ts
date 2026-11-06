import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaAdmin, createSession, setSessionCookie, clearSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

// POST { dealership_id, role: "admin" | "user" } — WGA admin opens the dealer side as that dealership.
// Issues a normal dealer session cookie (separate from the WGA cookie) tagged viewAs, so the
// dealer pages render exactly what the dealership sees. Orders placed while viewing are real.
export async function POST(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const role: "admin" | "user" = b.role === "user" ? "user" : "admin";
  let q = supabaseAdmin.from("dealer_dealerships").select("id, slug, name, brand, location, hide_cost_from_users").eq("active", true);
  q = b.dealership_id ? q.eq("id", b.dealership_id) : q.order("name").limit(1);
  const { data } = await q;
  const d = data?.[0];
  if (!d) return NextResponse.json({ error: "Dealership not found." }, { status: 404 });

  const token = await createSession({
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
  });
  setSessionCookie(token, "dealer");
  return NextResponse.json({ ok: true, next: "/portal/vehicle", dealership: d.name, role });
}

// DELETE — stop viewing as the dealership (clears only the dealer cookie)
export async function DELETE() {
  clearSessionCookie("dealer");
  return NextResponse.json({ ok: true });
}
