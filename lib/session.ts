import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionClaims } from "./types";
import { supabaseAdmin } from "./supabase";
import { ALL_PERMS, DEFAULT_PERMS, hasPerm } from "./perms";

// Two independent cookies so a WGA admin can be signed in to their side while
// also testing the dealership side in the same browser.
const DEALER_COOKIE = process.env.SESSION_COOKIE || "wga_dealer_session";
const WGA_COOKIE = "wga_admin_session";
// Dealers live on their phones; keep them signed in. WGA side stays short (PIN re-entry is quick).
const DEALER_TTL_HOURS = 24 * 30;
const WGA_TTL_HOURS = 12;
const ttlFor = (kind: "dealer" | "wga") => (kind === "wga" ? WGA_TTL_HOURS : DEALER_TTL_HOURS);

function cookieFor(kind: "dealer" | "wga") {
  return kind === "wga" ? WGA_COOKIE : DEALER_COOKIE;
}

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters. Generate with: openssl rand -base64 48"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(claims: SessionClaims): Promise<string> {
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlFor(claims.kind)}h`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      kind: (payload.kind as "dealer" | "wga") || "dealer",
      dealershipId: (payload.dealershipId as string) || "",
      slug: (payload.slug as string) || "",
      name: (payload.name as string) || "",
      brand: (payload.brand as string) || "Range Rover",
      location: (payload.location as string | null) ?? null,
      userId: (payload.userId as string | null) ?? null,
      userName: (payload.userName as string) || "",
      userEmail: (payload.userEmail as string) || "",
      role: (payload.role as "admin" | "user") || "user",
      canSeeCost: payload.canSeeCost === undefined ? true : !!payload.canSeeCost,
      viewAs: (payload.viewAs as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(token: string, kind: "dealer" | "wga" = "dealer") {
  cookies().set(cookieFor(kind), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlFor(kind) * 60 * 60,
  });
}

export function clearSessionCookie(kind: "dealer" | "wga" = "dealer") {
  cookies().set(cookieFor(kind), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Dealership session (dealer admin or dealer user).
export async function getSession(): Promise<SessionClaims | null> {
  const token = cookies().get(DEALER_COOKIE)?.value;
  if (!token) return null;
  const s = await verifySession(token);
  return s && s.kind === "dealer" ? s : null;
}

// White Glove Auto session (admin or team). Permissions are read live so a change on /wga/team
// applies on the person's next click, not their next sign-in.
export async function getWgaSession(): Promise<SessionClaims | null> {
  const token = cookies().get(WGA_COOKIE)?.value;
  if (!token) return null;
  const s = await verifySession(token);
  if (!s || s.kind !== "wga") return null;
  if (s.role === "admin") return { ...s, perms: ALL_PERMS };
  if (s.userId) {
    const { data } = await supabaseAdmin.from("wga_portal_access").select("perms").eq("user_id", s.userId).maybeSingle();
    s.perms = data?.perms ?? DEFAULT_PERMS;
  }
  return s;
}

// WGA admins only (team management).
export async function requireWgaAdmin(): Promise<SessionClaims | null> {
  const s = await getWgaSession();
  return s && s.role === "admin" ? s : null;
}

// Anyone on the WGA side holding a specific permission (admins always pass).
export async function requireWgaPerm(perm: string): Promise<SessionClaims | null> {
  const s = await getWgaSession();
  return s && hasPerm(s, perm) ? s : null;
}

export { DEALER_COOKIE as COOKIE_NAME };
