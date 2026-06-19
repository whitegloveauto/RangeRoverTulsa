import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { createSession, setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { slug?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const slug = (body.slug || "").trim().toLowerCase();
  const password = body.password || "";

  if (!slug || !password) {
    return NextResponse.json(
      { error: "Enter the dealership password to continue." },
      { status: 400 }
    );
  }

  const { data: dealership, error } = await supabaseAdmin
    .from("dealer_dealerships")
    .select("id, slug, name, brand, location, password_hash, active")
    .eq("slug", slug)
    .single();

  // Same generic message whether the slug is wrong or the password is wrong —
  // don't leak which dealerships exist.
  const genericFail = NextResponse.json(
    { error: "Incorrect password." },
    { status: 401 }
  );

  if (error || !dealership || !dealership.active) {
    return genericFail;
  }

  const ok = await bcrypt.compare(password, dealership.password_hash);
  if (!ok) {
    return genericFail;
  }

  const token = await createSession({
    dealershipId: dealership.id,
    slug: dealership.slug,
    name: dealership.name,
    brand: dealership.brand,
    location: dealership.location,
  });

  setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    dealership: {
      name: dealership.name,
      brand: dealership.brand,
      location: dealership.location,
    },
  });
}
