import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getWgaSession } from "@/lib/session";
import { authClient, portalState } from "@/lib/wgaAuth";

export const runtime = "nodejs";

// POST { current, next } — signed-in WGA user changes their Supabase Auth password.
// This is the same password used for the WGA portal and the iOS app.
export async function POST(req: Request) {
  const s = await getWgaSession();
  if (!s?.userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const current = String(b.current || "");
  const next = String(b.next || "");
  if (next.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  if (next === current) return NextResponse.json({ error: "Pick a different password than the current one." }, { status: 400 });

  const ac = authClient();
  const { error: signErr } = await ac.auth.signInWithPassword({ email: s.userEmail, password: current });
  if (signErr) return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });

  const { error } = await ac.auth.admin.updateUserById(s.userId, { password: next });
  if (error) return NextResponse.json({ error: "Could not change password." }, { status: 500 });

  await supabaseAdmin.from("wga_portal_auth").upsert({ user_id: s.userId, must_change_password: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  const st = await portalState(s.userId);
  return NextResponse.json({ ok: true, next: st.hasPin ? (s.role === "admin" ? "/wga/pricing" : "/wga/orders") : "/wga/pin?setup=1" });
}
