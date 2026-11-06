import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase";
import { getWgaSession } from "@/lib/session";
import { deviceUser, loadProfile, portalState, nextPath, issueSession, clearDeviceCookie, PIN_RULES } from "@/lib/wgaAuth";

export const runtime = "nodejs";

const validPin = (pin: string) => /^\d{4,6}$/.test(pin);

// GET — who this trusted browser belongs to (drives the PIN screen on /wga)
export async function GET() {
  const d = await deviceUser();
  if (!d) return NextResponse.json({ device: null });
  const { data: profile } = await supabaseAdmin.from("profiles").select("email, full_name, active").eq("id", d.userId).maybeSingle();
  if (!profile?.active) {
    clearDeviceCookie();
    return NextResponse.json({ device: null });
  }
  const st = await portalState(d.userId);
  return NextResponse.json({ device: { name: profile.full_name, email: profile.email, hasPin: st.hasPin } });
}

// POST { action: "set", pin, current? }  — signed-in user sets/changes their PIN
// POST { action: "verify", pin }         — trusted browser signs in with the PIN
// POST { action: "forget" }              — stop trusting this browser
export async function POST(req: Request) {
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const pin = String(b.pin || "");

  if (b.action === "set") {
    const s = await getWgaSession();
    if (!s?.userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    if (!validPin(pin)) return NextResponse.json({ error: "PIN must be 4 to 6 digits." }, { status: 400 });
    const st = await portalState(s.userId);
    if (st.hasPin && st.pinHash) {
      const ok = await bcrypt.compare(String(b.current || ""), st.pinHash);
      if (!ok) return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 });
    }
    const hash = await bcrypt.hash(pin, 10);
    const { error } = await supabaseAdmin
      .from("wga_portal_auth")
      .upsert({ user_id: s.userId, pin_hash: hash, pin_set_at: new Date().toISOString(), pin_failed_attempts: 0, pin_locked_until: null, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return NextResponse.json({ error: "Could not save PIN." }, { status: 500 });
    return NextResponse.json({ ok: true, next: s.role === "admin" ? "/wga/pricing" : "/wga/orders" });
  }

  if (b.action === "forget") {
    const d = await deviceUser();
    if (d) await supabaseAdmin.from("wga_portal_devices").delete().eq("id", d.deviceId);
    clearDeviceCookie();
    return NextResponse.json({ ok: true });
  }

  if (b.action === "verify") {
    const d = await deviceUser();
    if (!d) return NextResponse.json({ error: "This browser isn't set up for PIN sign-in. Use your password." }, { status: 401 });
    const { data: profile } = await supabaseAdmin.from("profiles").select("email").eq("id", d.userId).maybeSingle();
    const p = profile ? await loadProfile(profile.email) : "No account.";
    if (typeof p === "string") return NextResponse.json({ error: p }, { status: 403 });

    const st = await portalState(p.id);
    if (!st.hasPin || !st.pinHash) return NextResponse.json({ error: "No PIN set yet. Sign in with your password." }, { status: 401 });
    if (st.pinLockedUntil && st.pinLockedUntil > new Date()) {
      const mins = Math.ceil((st.pinLockedUntil.getTime() - Date.now()) / 60000);
      return NextResponse.json({ error: `Too many wrong PINs. Try again in ${mins} min or use your password.` }, { status: 429 });
    }
    const ok = validPin(pin) && (await bcrypt.compare(pin, st.pinHash));
    if (!ok) {
      const fails = st.pinFails + 1;
      const patch: any = { pin_failed_attempts: fails, updated_at: new Date().toISOString() };
      if (fails >= PIN_RULES.MAX_FAILS) {
        patch.pin_failed_attempts = 0;
        patch.pin_locked_until = new Date(Date.now() + PIN_RULES.LOCK_MINUTES * 60000).toISOString();
      }
      await supabaseAdmin.from("wga_portal_auth").update(patch).eq("user_id", p.id);
      const left = PIN_RULES.MAX_FAILS - fails;
      return NextResponse.json({ error: left > 0 ? `Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.` : `Locked for ${PIN_RULES.LOCK_MINUTES} minutes.` }, { status: 401 });
    }
    await supabaseAdmin.from("wga_portal_auth").update({ pin_failed_attempts: 0, pin_locked_until: null }).eq("user_id", p.id);
    await supabaseAdmin.from("wga_portal_devices").update({ last_used_at: new Date().toISOString() }).eq("id", d.deviceId);
    await issueSession(p);
    return NextResponse.json({ ok: true, next: nextPath(p, st), user: { name: p.full_name, role: p.role } });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
