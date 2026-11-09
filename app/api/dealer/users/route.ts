import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { randomBytes } from "crypto";
import { cleanAccess, getAccessDoc, saveAccessDoc } from "@/lib/dealerAccess";
import { dealerFingerprint, makeResetToken, requestOrigin } from "@/lib/reset";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { currentTenant } from "@/lib/tenant";

// A one-time "set up your login" link (good for 7 days, dies once they choose a password).
async function inviteLink(userId: string) {
  const fp = await dealerFingerprint(userId);
  if (!fp) return null;
  return `${requestOrigin()}/welcome?token=${encodeURIComponent(await makeResetToken("dealer", userId, fp, "7d"))}`;
}

async function emailInvite(to: string, name: string, link: string, inviter: string, dealership: string) {
  const { html, text } = renderEmail({
    base: requestOrigin(),
    partner: dealership,
    heading: `${name.split(" ")[0]}, you're invited.`,
    intro: `${inviter} added you to the ${dealership} dealer portal with White Glove Auto — price XPEL protection, send orders and track every car in one place.\n\nTap below to choose your password. The link works once and is good for 7 days.`,
    cta: { href: link, label: "Set up my login" },
  });
  return sendEmail({ to: [to], subject: `You're invited to the ${dealership} dealer portal`, html, text });
}

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  const { data, error } = await supabaseAdmin
    .from("dealer_users")
    .select("id, dealership_id, email, name, role, active, must_change_password, last_login_at")
    .eq("dealership_id", s.dealershipId)
    .order("name");
  if (error) return NextResponse.json({ error: "Could not load users." }, { status: 500 });
  return NextResponse.json({ users: data || [] });
}

// POST { action: "create"|"update"|"password", ... }
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const fail = (m: string, c = 500) => NextResponse.json({ error: m }, { status: c });

  if (b.action === "invite") {
    const email = String(b.email || "").trim().toLowerCase();
    const name = String(b.name || "").trim();
    if (!name) return fail("Add their name.", 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(`"${email || "(blank)"}" isn't an email address.`, 400);
    // unusable random password until they set their own from the link
    const hash = await bcrypt.hash(randomBytes(24).toString("base64url"), 10);
    const { data, error } = await supabaseAdmin
      .from("dealer_users")
      .insert({ dealership_id: s.dealershipId, email, name, role: b.role === "admin" ? "admin" : "user", password_hash: hash, must_change_password: false })
      .select("id, dealership_id, email, name, role, active, must_change_password, last_login_at")
      .single();
    if (error) return fail(error.code === "23505" ? `${email} already has a login.` : "Could not create the login.", error.code === "23505" ? 409 : 500);
    const access = cleanAccess(b.access);
    if (Object.keys(access).length) {
      const doc = await getAccessDoc(s.dealershipId);
      doc.users = { ...(doc.users || {}), [data.id]: access };
      await saveAccessDoc(s.dealershipId, doc);
    }
    const link = await inviteLink(data.id);
    let emailed = false;
    if (link && emailConfigured()) {
      const t = await currentTenant().catch(() => null);
      emailed = await emailInvite(email, name, link, s.userName, t?.dealership.name || s.name);
    }
    return NextResponse.json({ ok: true, user: data, link, emailed });
  }

  if (b.action === "create") {
    const email = String(b.email || "").trim().toLowerCase();
    const name = String(b.name || "").trim();
    if (!email || !name) return fail("Name and email are required.", 400);
    if (!b.password || String(b.password).length < 8) return fail("Temporary password must be at least 8 characters.", 400);
    const hash = await bcrypt.hash(String(b.password), 10);
    const { data, error } = await supabaseAdmin
      .from("dealer_users")
      .insert({ dealership_id: s.dealershipId, email, name, role: b.role === "admin" ? "admin" : "user", password_hash: hash, must_change_password: true })
      .select("id, dealership_id, email, name, role, active, must_change_password, last_login_at")
      .single();
    if (error) return fail(error.code === "23505" ? "That email already has a login." : "Could not create user.");
    return NextResponse.json({ ok: true, user: data });
  }
  // Scope every other action to this dealership
  const { data: target } = await supabaseAdmin.from("dealer_users").select("id").eq("id", b.id).eq("dealership_id", s.dealershipId).maybeSingle();
  if (!target) return fail("User not found.", 404);

  if (b.action === "update") {
    const patch: any = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.role !== undefined) patch.role = b.role === "admin" ? "admin" : "user";
    if (b.active !== undefined) patch.active = !!b.active;
    if (b.id === s.userId && patch.role === "user") return fail("You can't remove your own admin role.", 400);
    const { error } = await supabaseAdmin.from("dealer_users").update(patch).eq("id", b.id);
    return error ? fail("Could not update user.") : NextResponse.json({ ok: true });
  }
  if (b.action === "link") {
    const { data: u } = await supabaseAdmin.from("dealer_users").select("email, name").eq("id", b.id).maybeSingle();
    const link = await inviteLink(b.id);
    if (!link || !u) return fail("Could not make a link.");
    let emailed = false;
    if (b.email && emailConfigured()) {
      const t = await currentTenant().catch(() => null);
      emailed = await emailInvite(u.email, u.name, link, s.userName, t?.dealership.name || s.name);
    }
    return NextResponse.json({ ok: true, link, emailed });
  }
  if (b.action === "password") {
    if (!b.password || String(b.password).length < 8) return fail("Password must be at least 8 characters.", 400);
    const hash = await bcrypt.hash(String(b.password), 10);
    const { error } = await supabaseAdmin.from("dealer_users").update({ password_hash: hash, must_change_password: true }).eq("id", b.id);
    return error ? fail("Could not reset password.") : NextResponse.json({ ok: true });
  }
  return fail("Unknown action.", 400);
}
