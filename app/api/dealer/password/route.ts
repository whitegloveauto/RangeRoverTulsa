import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

// POST { current, next } — a signed-in dealer user changes their own password
export async function POST(req: Request) {
  const s = await getSession();
  if (!s || !s.userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const next = String(b.next || "");
  if (next.length < 8) return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  const { data: u } = await supabaseAdmin.from("dealer_users").select("password_hash").eq("id", s.userId).single();
  if (!u) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const ok = await bcrypt.compare(String(b.current || ""), u.password_hash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });
  const hash = await bcrypt.hash(next, 10);
  const { error } = await supabaseAdmin.from("dealer_users").update({ password_hash: hash, must_change_password: false }).eq("id", s.userId);
  if (error) return NextResponse.json({ error: "Could not change password." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
