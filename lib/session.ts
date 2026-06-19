import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { SessionClaims } from "./types";

const COOKIE_NAME = process.env.SESSION_COOKIE || "wga_dealer_session";
const SESSION_TTL_HOURS = 12;

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 characters. Generate with: openssl rand -base64 48"
    );
  }
  return new TextEncoder().encode(secret);
}

// Create a signed session token for a dealership.
export async function createSession(claims: SessionClaims): Promise<string> {
  return await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(getSecret());
}

// Verify a token and return its claims, or null if invalid/expired.
export async function verifySession(
  token: string
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      dealershipId: payload.dealershipId as string,
      slug: payload.slug as string,
      name: payload.name as string,
      brand: payload.brand as string,
      location: (payload.location as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

// Write the session cookie (called from the login route).
export function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 60 * 60,
  });
}

// Clear the session cookie (logout).
export function clearSessionCookie() {
  cookies().set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// Read + verify the current session from cookies. Returns claims or null.
export async function getSession(): Promise<SessionClaims | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export { COOKIE_NAME };
