import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authClient } from "@/lib/wgaAuth";
import { readResetToken, wgaFingerprint } from "@/lib/reset";

export const runtime = "nodejs";

async function check(token: string) {
  const t = await readResetToken("wga", token);
  if (!t) return null;
  return (await wgaFingerprint(t.userId)) === t.fp ? t.userId : null;
}

// GET ?token= — still valid?
export async function GET(req: Request) {
  const userId = await check(new URL(req.url).searchParams.get("token") || "");
  if (!userId) return NextResponse.json({ valid: false });
  const { data } = await supabaseAdmin.from("profiles").select("email, full_name").eq("id", userId).maybeSingle();
  return NextResponse.json({ valid: true, email: data?.email || "", name: data?.full_name || "" });
}

// POST { token, password } — sets the Supabase Auth password (same one the iOS app uses).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const password = String(b.password || "");
  if (password.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  const userId = await check(String(b.token || ""));
  if (!userId) return NextResponse.json({ error: "This reset link has expired or was already used. Request a new one from the sign-in page." }, { status: 400 });
  const { error } = await authClient().auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ error: "Could not save the new password." }, { status: 500 });
  // Bumping updated_at retires this link (and any other outstanding ones).
  await supabaseAdmin.from("wga_portal_auth").upsert({ user_id: userId, must_change_password: false, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return NextResponse.json({ ok: true });
}
