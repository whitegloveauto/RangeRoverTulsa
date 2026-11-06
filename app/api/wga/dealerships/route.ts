import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm } from "@/lib/session";

export const runtime = "nodejs";

// GET — dealerships + their users
export async function GET() {
  const s = await requireWgaPerm("dealerships");
  if (!s) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  const [d, u] = await Promise.all([
    supabaseAdmin.from("dealer_dealerships").select("id, slug, name, short_name, brand, brand_key, hostnames, logo_url, theme_override, location, billing_terms, active, hide_cost_from_users, created_at").order("name"),
    supabaseAdmin.from("dealer_users").select("id, dealership_id, email, name, role, active, must_change_password, last_login_at").order("name"),
  ]);
  const { data: brands } = await supabaseAdmin.from("dealer_brands").select("key, name, make, logo_light_url, theme, tagline").order("name");
  if (d.error || u.error) return NextResponse.json({ error: "Could not load dealerships." }, { status: 500 });
  return NextResponse.json({ dealerships: d.data || [], users: u.data || [], brands: brands || [] });
}

// POST — actions
//  dealership.update   {id, name?, location?, active?, hide_cost_from_users?, billing_terms?}
//  dealership.password {id, password}        (legacy shared password)
//  user.create         {dealership_id, email, name, role, password}
//  user.update         {id, name?, role?, active?}
//  user.password       {id, password}
export async function POST(req: Request) {
  const s = await requireWgaPerm("dealerships");
  if (!s) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const fail = (m: string, c = 500) => NextResponse.json({ error: m }, { status: c });

  switch (b.action) {
    // dealership.create {name, slug, short_name?, brand_key, location?, hostnames?, billing_terms?, copy_pricing_from?, admin_name?, admin_email?, admin_password?}
    case "dealership.create": {
      const name = String(b.name || "").trim();
      const slug = String(b.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
      const brand_key = String(b.brand_key || "").trim();
      if (!name || !slug || !brand_key) return fail("Name, slug and brand are required.", 400);
      const { data: br } = await supabaseAdmin.from("dealer_brands").select("key, make").eq("key", brand_key).maybeSingle();
      if (!br) return fail("Unknown brand.", 400);
      const hostnames = String(b.hostnames || "").split(/[,\s]+/).map((h: string) => h.trim().toLowerCase()).filter(Boolean);
      const sharedPw = await bcrypt.hash(require("crypto").randomBytes(12).toString("base64url"), 10); // unusable until set
      const { data: created, error } = await supabaseAdmin
        .from("dealer_dealerships")
        .insert({ name, slug, short_name: b.short_name || null, brand: br.make, brand_key, location: b.location || null, hostnames, billing_terms: Number(b.billing_terms ?? 30), active: true, hide_cost_from_users: false, password_hash: sharedPw, theme_override: {} })
        .select("id")
        .single();
      if (error) return fail(error.code === "23505" ? "That slug is already taken." : "Could not create dealership.");
      // A pre-seeded brand has colors but no catalog yet: clone services + packages from Land Rover so pricing isn't empty.
      const { count } = await supabaseAdmin.from("dealer_services").select("id", { count: "exact", head: true }).eq("brand_key", brand_key);
      if (!count) {
        const { data: svcs } = await supabaseAdmin.from("dealer_services").select("*").eq("brand_key", "land-rover").order("sort_order");
        for (const svc of svcs || []) {
          const { id: oldId, created_at, updated_at, ...rest } = svc as any;
          const { data: ns } = await supabaseAdmin.from("dealer_services").insert({ ...rest, brand: br.make, brand_key, key: `${rest.key}-${brand_key}` }).select("id").single();
          if (!ns) continue;
          const { data: items } = await supabaseAdmin.from("dealer_service_items").select("*").eq("service_id", oldId);
          if (items?.length) await supabaseAdmin.from("dealer_service_items").insert(items.map(({ id, created_at, updated_at, ...it }: any) => ({ ...it, service_id: ns.id })));
        }
      }
      // copy WGA cost / suggested retail from a sibling dealership of the same brand
      if (b.copy_pricing_from) {
        const { data: src } = await supabaseAdmin.from("dealer_model_pricing").select("brand, model, item_id, cost, suggested_retail").eq("dealership_id", b.copy_pricing_from);
        if (src?.length) await supabaseAdmin.from("dealer_model_pricing").insert(src.map((r) => ({ ...r, dealership_id: created.id, updated_by: s.userEmail })));
      }
      // first dealer admin login
      if (b.admin_email && b.admin_password) {
        if (String(b.admin_password).length < 8) return fail("Admin password must be 8+ characters.", 400);
        await supabaseAdmin.from("dealer_users").insert({ dealership_id: created.id, email: String(b.admin_email).trim().toLowerCase(), name: b.admin_name || "Dealer admin", role: "admin", password_hash: await bcrypt.hash(String(b.admin_password), 10), must_change_password: true, active: true });
      }
      return NextResponse.json({ ok: true, id: created.id });
    }
    case "dealership.update": {
      const patch: any = { updated_at: new Date().toISOString() };
      for (const k of ["name", "short_name", "location", "active", "hide_cost_from_users", "billing_terms", "brand_key", "logo_url", "theme_override"]) if (b[k] !== undefined) patch[k] = b[k];
      if (b.hostnames !== undefined) patch.hostnames = String(Array.isArray(b.hostnames) ? b.hostnames.join(",") : b.hostnames).split(/[,\s]+/).map((h: string) => h.trim().toLowerCase()).filter(Boolean);
      if (b.brand_key) {
        const { data: br } = await supabaseAdmin.from("dealer_brands").select("make").eq("key", b.brand_key).maybeSingle();
        if (br) patch.brand = br.make;
      }
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
