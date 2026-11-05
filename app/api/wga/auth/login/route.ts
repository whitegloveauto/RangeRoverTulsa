import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";
import { createSession, setSessionCookie } from "@/lib/session";

export const runtime = "nodejs";

// White Glove Auto sign-in: same email + password as the WGA portal
// (Supabase Auth + profiles). Admins can edit pricing; team members with
// access_dealer_deals can view/work orders.
export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  // A throwaway auth client (no session persistence) just to verify credentials.
  const authClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signIn, error: signErr } = await authClient.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.user) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name, role, active, access_dealer_deals")
    .eq("email", email)
    .maybeSingle();
  if (!profile || !profile.active) {
    return NextResponse.json({ error: "No active White Glove account for this email." }, { status: 403 });
  }
  const isAdmin = profile.role === "admin";
  if (!isAdmin && !profile.access_dealer_deals) {
    return NextResponse.json({ error: "You don't have access to the dealer program." }, { status: 403 });
  }

  const token = await createSession({
    kind: "wga",
    dealershipId: "",
    slug: "wga",
    name: "White Glove Auto",
    brand: "Range Rover",
    location: "Tulsa, Oklahoma",
    userId: signIn.user.id,
    userName: profile.full_name,
    userEmail: profile.email,
    role: isAdmin ? "admin" : "user",
    canSeeCost: true,
  });
  setSessionCookie(token, "wga");
  return NextResponse.json({ ok: true, user: { name: profile.full_name, role: isAdmin ? "admin" : "user" } });
}
