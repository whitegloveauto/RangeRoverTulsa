import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { createSession, setSessionCookie } from "@/lib/session";

// WGA-side auth helpers: Supabase Auth password check, per-user portal state
// (must-change-password, PIN), and the long-lived "trusted device" cookie that
// lets a browser sign in with just a PIN after one full password sign-in.

export const DEVICE_COOKIE = "wga_admin_device";
const DEVICE_TTL_DAYS = 180;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MINUTES = 15;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function authClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface WgaProfile {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "user";
}

// profiles row → portal role, or an error string
export async function loadProfile(email: string): Promise<WgaProfile | string> {
  const { data: profile } = await supabaseAdmin.from("profiles").select("id, email, full_name, role, active, access_dealer_deals").eq("email", email).maybeSingle();
  if (!profile || !profile.active) return "No active White Glove account for this email.";
  const isAdmin = profile.role === "admin";
  if (!isAdmin && !profile.access_dealer_deals) return "You don't have access to the dealer program.";
  return { id: profile.id, email: profile.email, full_name: profile.full_name, role: isAdmin ? "admin" : "user" };
}

export async function portalState(userId: string) {
  const { data } = await supabaseAdmin.from("wga_portal_auth").select("must_change_password, pin_hash, pin_failed_attempts, pin_locked_until").eq("user_id", userId).maybeSingle();
  return {
    mustChangePassword: !!data?.must_change_password,
    hasPin: !!data?.pin_hash,
    pinHash: data?.pin_hash || null,
    pinFails: data?.pin_failed_attempts || 0,
    pinLockedUntil: data?.pin_locked_until ? new Date(data.pin_locked_until) : null,
  };
}

// Where to send the user after a successful sign-in.
export function nextPath(p: WgaProfile, st: { mustChangePassword: boolean; hasPin: boolean }) {
  if (st.mustChangePassword) return "/wga/password?first=1";
  if (!st.hasPin) return "/wga/pin?setup=1";
  return p.role === "admin" ? "/wga/pricing" : "/wga/orders";
}

export async function issueSession(p: WgaProfile) {
  const token = await createSession({
    kind: "wga",
    dealershipId: "",
    slug: "wga",
    name: "White Glove Auto",
    brand: "Range Rover",
    location: "Tulsa, Oklahoma",
    userId: p.id,
    userName: p.full_name,
    userEmail: p.email,
    role: p.role,
    canSeeCost: true,
  });
  setSessionCookie(token, "wga");
  await supabaseAdmin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", p.id);
}

// Mark this browser as trusted for PIN sign-in. Raw token lives only in the cookie; we store its hash.
export async function issueDeviceCookie(userId: string, userAgent: string | null) {
  const raw = randomBytes(32).toString("base64url");
  await supabaseAdmin.from("wga_portal_devices").insert({ user_id: userId, token_hash: sha256(raw), user_agent: userAgent?.slice(0, 200) || null });
  cookies().set(DEVICE_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearDeviceCookie() {
  cookies().set(DEVICE_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

// The trusted-device record for this browser, if any.
export async function deviceUser(): Promise<{ deviceId: string; userId: string } | null> {
  const raw = cookies().get(DEVICE_COOKIE)?.value;
  if (!raw) return null;
  const { data } = await supabaseAdmin.from("wga_portal_devices").select("id, user_id").eq("token_hash", sha256(raw)).maybeSingle();
  return data ? { deviceId: data.id, userId: data.user_id } : null;
}

export const PIN_RULES = { MAX_FAILS: PIN_MAX_FAILS, LOCK_MINUTES: PIN_LOCK_MINUTES };
