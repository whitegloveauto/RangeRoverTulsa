import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionClaims } from "./types";

// Two independent cookies so a WGA admin can be signed in to their side while
// also testing the dealership side in the same browser.
const DEALER_COOKIE = process.env.SESSION_COOKIE || "wga_dealer_session";
const WGA_COOKIE = "wga_admin_session";
const SESSION_TTL_HOURS = 12;

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
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
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
    maxAge: SESSION_TTL_HOURS * 60 * 60,
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

// White Glove Auto session (admin or team).
export async function getWgaSession(): Promise<SessionClaims | null> {
  const token = cookies().get(WGA_COOKIE)?.value;
  if (!token) return null;
  const s = await verifySession(token);
  return s && s.kind === "wga" ? s : null;
}

// WGA admins only (pricing edits, dealership management).
export async function requireWgaAdmin(): Promise<SessionClaims | null> {
  const s = await getWgaSession();
  return s && s.role === "admin" ? s : null;
}

export { DEALER_COOKIE as COOKIE_NAME };
