import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { createSession, setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

// Dealership sign-in.
//  - email + password  → dealer_users (admin or user)
//  - password only     → legacy shared dealership password (signs in as dealer admin)
export async function POST(req: Request) {
  let body: { slug?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = (body.slug || "").trim().toLowerCase();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!slug || !password) {
    return NextResponse.json({ error: "Enter your password to continue." }, { status: 400 });
  }

  const genericFail = NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

  const { data: dealership, error } = await supabaseAdmin
    .from("dealer_dealerships")
    .select("id, slug, name, brand, location, password_hash, active, hide_cost_from_users")
    .eq("slug", slug)
    .single();
  if (error || !dealership || !dealership.active) return genericFail;

  let userId: string | null = null;
  let userName = "Dealership";
  let userEmail = "";
  let role: "admin" | "user" = "admin";
  let mustChange = false;

  if (email) {
    const { data: user } = await supabaseAdmin
      .from("dealer_users")
      .select("id, email, name, role, password_hash, active, must_change_password")
      .eq("dealership_id", dealership.id)
      .ilike("email", email)
      .maybeSingle();
    if (!user || !user.active) return genericFail;
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return genericFail;
    userId = user.id;
    userName = user.name;
    userEmail = user.email;
    role = user.role === "admin" ? "admin" : "user";
    mustChange = !!user.must_change_password;
    await supabaseAdmin.from("dealer_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
  } else {
    // Legacy shared password → treated as a dealership admin.
    const ok = await bcrypt.compare(password, dealership.password_hash);
    if (!ok) return genericFail;
    userName = "Dealership Admin";
  }

  const canSeeCost = role === "admin" ? true : !dealership.hide_cost_from_users;

  const token = await createSession({
    kind: "dealer",
    dealershipId: dealership.id,
    slug: dealership.slug,
    name: dealership.name,
    brand: dealership.brand,
    location: dealership.location,
    userId,
    userName,
    userEmail,
    role,
    canSeeCost,
  });
  setSessionCookie(token, "dealer");

  return NextResponse.json({
    ok: true,
    mustChangePassword: mustChange,
    dealership: { name: dealership.name, brand: dealership.brand, location: dealership.location },
    user: { name: userName, role, canSeeCost },
  });
}
