import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { dealerFingerprint, readResetToken } from "@/lib/reset";

export const runtime = "nodejs";

// GET ?token= — is this link still good? (so the page can say so before they type)
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const t = await readResetToken("dealer", token);
  if (!t) return NextResponse.json({ valid: false });
  const f = await dealerFingerprint(t.userId);
  if (!f || f !== t.fp) return NextResponse.json({ valid: false });
  const { data } = await supabaseAdmin.from("dealer_users").select("email, name").eq("id", t.userId).maybeSingle();
  return NextResponse.json({ valid: true, email: data?.email || "", name: data?.name || "" });
}

// POST { token, password }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const password = String(b.password || "");
  if (password.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  const t = await readResetToken("dealer", String(b.token || ""));
  const dead = NextResponse.json({ error: "This reset link has expired or was already used. Request a new one from the sign-in page." }, { status: 400 });
  if (!t) return dead;
  const f = await dealerFingerprint(t.userId);
  if (!f || f !== t.fp) return dead;
  const hash = await bcrypt.hash(password, 10);
  const { error } = await supabaseAdmin.from("dealer_users").update({ password_hash: hash, must_change_password: false }).eq("id", t.userId);
  if (error) return NextResponse.json({ error: "Could not save the new password." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
