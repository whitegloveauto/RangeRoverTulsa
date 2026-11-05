import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  const { data, error } = await supabaseAdmin
    .from("dealer_users")
    .select("id, dealership_id, email, name, role, active, must_change_password, last_login_at")
    .eq("dealership_id", s.dealershipId)
    .order("name");
  if (error) return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  return NextResponse.json({ users: data || [] });
}

// POST { action: "create"|"update"|"password", ... }
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const fail = (m: string, c = 500) => NextResponse.json({ error: m }, { status: c });

  if (b.action === "create") {
    const email = String(b.email || "").trim().toLowerCase();
    const name = String(b.name || "").trim();
    if (!email || !name) return fail("Name and email are required.", 400);
    if (!b.password || String(b.password).length < 8) return fail("Temporary password must be at least 8 characters.", 400);
    const hash = await bcrypt.hash(String(b.password), 10);
    const { data, error } = await supabaseAdmin
      .from("dealer_users")
      .insert({ dealership_id: s.dealershipId, email, name, role: b.role === "admin" ? "admin" : "user", password_hash: hash, must_change_password: true })
      .select("id, dealership_id, email, name, role, active, must_change_password, last_login_at")
      .single();
    if (error) return fail(error.code === "23505" ? "That email already has a login." : "Could not create user.");
    return NextResponse.json({ ok: true, user: data });
  }
  // Scope every other action to this dealership
  const { data: target } = await supabaseAdmin.from("dealer_users").select("id").eq("id", b.id).eq("dealership_id", s.dealershipId).maybeSingle();
  if (!target) return fail("User not found.", 404);

  if (b.action === "update") {
    const patch: any = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.role !== undefined) patch.role = b.role === "admin" ? "admin" : "user";
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.id === s.userId && patch.role === "user") return fail("You can't remove your own admin role.", 400);
    const { error } = await supabaseAdmin.from("dealer_users").update(patch).eq("id", b.id);
    return error ? fail("Could not update user.") : NextResponse.json({ ok: true });
  }
  if (b.action === "password") {
    if (!b.password || String(b.password).length < 8) return fail("Password must be at least 8 characters.", 400);
    const hash = await bcrypt.hash(String(b.password), 10);
    const { error } = await supabaseAdmin.from("dealer_users").update({ password_hash: hash, must_change_password: true }).eq("id", b.id);
    return error ? fail("Could not reset password.") : NextResponse.json({ ok: true });
  }
  return fail("Unknown action.", 400);
}
