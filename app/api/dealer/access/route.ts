import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { ACCESS_QUESTIONS, cleanAccess, defaultAccess, getAccessDoc, resolveAccess, saveAccessDoc } from "@/lib/dealerAccess";
import { getNotifyPrefs, setNotifyPrefs } from "@/lib/dealerEmail";
import { emailConfigured } from "@/lib/email";

export const runtime = "nodejs";

async function snapshot(dealershipId: string) {
  const [doc, { data: d }, { data: users }, notify] = await Promise.all([
    getAccessDoc(dealershipId),
    supabaseAdmin.from("dealer_dealerships").select("hide_cost_from_users").eq("id", dealershipId).maybeSingle(),
    supabaseAdmin.from("dealer_users").select("id, role").eq("dealership_id", dealershipId),
    getNotifyPrefs(dealershipId),
  ]);
  const legacy = !!d?.hide_cost_from_users;
  const resolved: Record<string, any> = {};
  for (const u of users || []) resolved[u.id] = resolveAccess(doc, u.id, u.role === "admin" ? "admin" : "user", legacy);
  return {
    questions: ACCESS_QUESTIONS,
    defaults: defaultAccess(doc, legacy),
    overrides: doc.users || {},
    resolved,
    profiles: doc.profiles || {},
    setup: doc.setup || { done: false },
    notify,
    emailConfigured: emailConfigured(),
  };
}

// GET — the dealership's access defaults, each person's access, setup state (dealer admins)
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  return NextResponse.json(await snapshot(s.dealershipId));
}

// PUT { defaults?, users?: { [id]: Partial<Access> | null }, profile?: { name, title, phone },
//       notify?: { users?, extra? }, setupDone?: boolean, setupReset?: boolean }
export async function PUT(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const doc = await getAccessDoc(s.dealershipId);

  if (b.defaults) {
    doc.defaults = { ...(doc.defaults || {}), ...cleanAccess(b.defaults) };
    // keep the old dealership-wide switch in step (other apps read it)
    if (typeof doc.defaults.see_cost === "boolean") await supabaseAdmin.from("dealer_dealerships").update({ hide_cost_from_users: !doc.defaults.see_cost }).eq("id", s.dealershipId);
  }
  if (b.users && typeof b.users === "object") {
    const { data: mine } = await supabaseAdmin.from("dealer_users").select("id").eq("dealership_id", s.dealershipId);
    const ids = new Set((mine || []).map((u) => u.id));
    doc.users = doc.users || {};
    for (const [id, v] of Object.entries(b.users)) {
      if (!ids.has(id)) continue;
      if (v === null) delete doc.users[id];
      else doc.users[id] = { ...(doc.users[id] || {}), ...cleanAccess(v) };
    }
  }
  if (b.profile && s.userId) {
    doc.profiles = doc.profiles || {};
    doc.profiles[s.userId] = { title: String(b.profile.title || "").slice(0, 60), phone: String(b.profile.phone || "").slice(0, 30) };
    const name = String(b.profile.name || "").trim();
    if (name) await supabaseAdmin.from("dealer_users").update({ name: name.slice(0, 80) }).eq("id", s.userId);
  }
  if (b.setupDone) doc.setup = { done: true, at: new Date().toISOString(), by: s.userName };
  if (b.setupReset) doc.setup = { done: false, at: new Date().toISOString(), by: s.userName };
  if (!(await saveAccessDoc(s.dealershipId, doc))) return NextResponse.json({ error: "Could not save." }, { status: 500 });

  if (b.notify) {
    const cur = await getNotifyPrefs(s.dealershipId);
    if (b.notify.users) for (const [id, lvl] of Object.entries(b.notify.users)) if (["mine", "all", "off"].includes(String(lvl))) cur.users[id] = lvl as any;
    if (Array.isArray(b.notify.extra)) cur.extra = b.notify.extra.map((e: any) => String(e).trim().toLowerCase()).filter((e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 20);
    await setNotifyPrefs(s.dealershipId, cur);
  }
  return NextResponse.json({ ok: true, ...(await snapshot(s.dealershipId)) });
}
