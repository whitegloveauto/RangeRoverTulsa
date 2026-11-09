import { SignJWT, jwtVerify } from "jose";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

// Password-reset links without a token table: a signed, 1-hour JWT that carries a fingerprint of
// the account's current password state. Once the password changes, the fingerprint no longer
// matches, so each link works exactly once (and any older links die with it).

const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || "");
const fp = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 20);

export type ResetKind = "dealer" | "wga";

export async function dealerFingerprint(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("dealer_users").select("password_hash, active").eq("id", userId).maybeSingle();
  return data?.active ? fp(data.password_hash || "") : null;
}

export async function wgaFingerprint(userId: string): Promise<string> {
  const { data } = await supabaseAdmin.from("wga_portal_auth").select("updated_at").eq("user_id", userId).maybeSingle();
  return fp(`wga:${userId}:${data?.updated_at || "none"}`);
}

export async function makeResetToken(kind: ResetKind, userId: string, fingerprint: string, ttl = "1h"): Promise<string> {
  return new SignJWT({ typ: `${kind}-reset`, fp: fingerprint })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

export async function readResetToken(kind: ResetKind, token: string): Promise<{ userId: string; fp: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.typ !== `${kind}-reset` || !payload.sub) return null;
    return { userId: payload.sub, fp: String(payload.fp || "") };
  } catch {
    return null;
  }
}

// https://<host the request came in on> — reset links go back to the same portal.
export function requestOrigin(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  if (!host) return (process.env.URL || "https://lrt.whitegloveauto.app").replace(/\/$/, "");
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  return `${proto}://${host}`;
}

// One request per address per minute per server instance — enough to stop a stuck button or a script.
const recent = new Map<string, number>();
export function throttled(key: string): boolean {
  const now = Date.now();
  const last = recent.get(key) || 0;
  if (now - last < 60_000) return true;
  recent.set(key, now);
  if (recent.size > 500) recent.clear();
  return false;
}
