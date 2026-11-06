import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaAdmin } from "@/lib/session";
import { ALL_PERMS, DEFAULT_PERMS } from "@/lib/perms";

export const runtime = "nodejs";

// GET — every active WGA staff profile with their dealer-program permissions
export async function GET() {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const [{ data: profiles }, { data: access }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, email, full_name, role, active, access_dealer_deals, last_login_at").eq("active", true).order("full_name"),
    supabaseAdmin.from("wga_portal_access").select("user_id, perms, updated_at"),
  ]);
  const byId = new Map((access || []).map((a) => [a.user_id, a]));
  const team = (profiles || []).map((p) => {
    const a = byId.get(p.id);
    const isAdmin = p.role === "admin";
    const hasAccess = isAdmin || !!a || !!p.access_dealer_deals;
    return { id: p.id, email: p.email, name: p.full_name, isAdmin, hasAccess, perms: isAdmin ? ALL_PERMS : a?.perms ?? (p.access_dealer_deals ? DEFAULT_PERMS : []), last_login_at: p.last_login_at };
  });
  return NextResponse.json({ team });
}

// POST { user_id, perms: string[] } — set what a person can see (empty array = no access)
export async function POST(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (!b.user_id) return NextResponse.json({ error: "Missing user." }, { status: 400 });
  const perms = (Array.isArray(b.perms) ? b.perms : []).filter((p: any) => ALL_PERMS.includes(p) && p !== "team");
  const { data: prof } = await supabaseAdmin.from("profiles").select("id, role").eq("id", b.user_id).maybeSingle();
  if (!prof) return NextResponse.json({ error: "Unknown user." }, { status: 404 });
  if (prof.role === "admin") return NextResponse.json({ error: "Admins always have everything." }, { status: 400 });
  if (perms.length === 0) {
    await supabaseAdmin.from("wga_portal_access").delete().eq("user_id", b.user_id);
    await supabaseAdmin.from("profiles").update({ access_dealer_deals: false }).eq("id", b.user_id);
    return NextResponse.json({ ok: true, perms: [] });
  }
  const { error } = await supabaseAdmin.from("wga_portal_access").upsert({ user_id: b.user_id, perms, updated_by: s.userEmail, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  // keep the iOS app's flag in sync so dealer-order pushes reach them
  await supabaseAdmin.from("profiles").update({ access_dealer_deals: perms.includes("orders") || perms.includes("comebacks") }).eq("id", b.user_id);
  return NextResponse.json({ ok: true, perms });
}
