import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { data } = await supabaseAdmin.from("dealer_dealerships").select("name, location, hide_cost_from_users").eq("id", s.dealershipId).single();
  return NextResponse.json({ settings: data, role: s.role });
}

// PATCH { hide_cost_from_users }
export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const patch: any = { updated_at: new Date().toISOString() };
  if (b.hide_cost_from_users !== undefined) patch.hide_cost_from_users = !!b.hide_cost_from_users;
  const { error } = await supabaseAdmin.from("dealer_dealerships").update(patch).eq("id", s.dealershipId);
  if (error) return NextResponse.json({ error: "Could not save settings." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
