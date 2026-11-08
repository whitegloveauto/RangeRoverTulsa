import { createHash, timingSafeEqual } from "crypto";

// Shared key for scheduled jobs calling back into the app (derived from SESSION_SECRET, so there's
// no extra secret to manage). The Netlify scheduled function computes the same value.
export const internalKey = () => createHash("sha256").update(`wga-internal:${process.env.SESSION_SECRET || ""}`).digest("hex");

export function checkInternalKey(given: string | null): boolean {
  if (!process.env.SESSION_SECRET || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(internalKey());
  return a.length === b.length && timingSafeEqual(a, b);
}
