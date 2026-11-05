import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaAdmin } from "@/lib/session";

export const runtime = "nodejs";

// GET — dealerships + their users
export async function GET() {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const [d, u] = await Promise.all([
    supabaseAdmin.from("dealer_dealerships").select("id, slug, name, brand, location, billing_terms, active, hide_cost_from_users, created_at").order("name"),
    supabaseAdmin.from("dealer_users").select("id, dealership_id, email, name, role, active, must_change_password, last_login_at").order("name"),
  ]);
  if (d.error || u.error) return NextResponse.json({ error: "Could not load dealerships." }, { status: 500 });
  return NextResponse.json({ dealerships: d.data || [], users: u.data || [] });
}

// POST — actions
//  dealership.update   {id, name?, location?, active?, hide_cost_from_users?, billing_terms?}
//  dealership.password {id, password}        (legacy shared password)
//  user.create         {dealership_id, email, name, role, password}
//  user.update         {id, name?, role?, active?}
//  user.password       {id, password}
export async function POST(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const fail = (m: string, c = 500) => NextResponse.json({ error: m }, { status: c });

  switch (b.action) {
    case "dealership.update": {
      const patch: any = { updated_at: new Date().toISOString() };
      for (const k of ["name", "location", "active", "hide_cost_from_users", "billing_terms"]) if (b[k] !== undefined) patch[k] = b[k];
      const { error } = await supabaseAdmin.from("dealer_dealerships").update(patch).eq("id", b.id);
      return error ? fail("Could not update dealership.") : NextResponse.json({ ok: true });
    }
    case "dealership.password": {
      if (!b.password || String(b.password).length < 8) return fail("Password must be at least 8 characters.", 400);
      const hash = await bcrypt.hash(String(b.password), 10);
      const { error } = await supabaseAdmin.from("dealer_dealerships").update({ password_hash: hash }).eq("id", b.id);
      return error ? fail("Could not set password.") : NextResponse.json({ ok: true });
    }
    case "user.create": {
      const email = String(b.email || "").trim().toLowerCase();
      const name = String(b.name || "").trim();
      if (!b.dealership_id || !email || !name) return fail("Dealership, name and email are required.", 400);
      if (!b.password || String(b.password).length < 8) return fail("Temporary password must be at least 8 characters.", 400);
      const hash = await bcrypt.hash(String(b.password), 10);
      const { data, error } = await supabaseAdmin
        .from("dealer_users")
        .insert({ dealership_id: b.dealership_id, email, name, role: b.role === "admin" ? "admin" : "user", password_hash: hash, must_change_password: true })
        .select("id, dealership_id, email, name, role, active, must_change_password, last_login_at")
        .single();
      if (error) return fail(error.code === "23505" ? "That email already has a login." : "Could not create user.");
      return NextResponse.json({ ok: true, user: data });
    }
    case "user.update": {
      const patch: any = {};
      if (b.name !== undefined) patch.name = String(b.name).trim();
      if (b.role !== undefined) patch.role = b.role === "admin" ? "admin" : "user";
      if (b.active !== undefined) patch.active = !!b.active;
      const { error } = await supabaseAdmin.from("dealer_users").update(patch).eq("id", b.id);
      return error ? fail("Could not update user.") : NextResponse.json({ ok: true });
    }
    case "user.password": {
      if (!b.password || String(b.password).length < 8) return fail("Password must be at least 8 characters.", 400);
      const hash = await bcrypt.hash(String(b.password), 10);
      const { error } = await supabaseAdmin.from("dealer_users").update({ password_hash: hash, must_change_password: true }).eq("id", b.id);
      return error ? fail("Could not reset password.") : NextResponse.json({ ok: true });
    }
    default:
      return fail("Unknown action.", 400);
  }
}
