import { NextResponse } from "next/server";
import { createSession, readHandoff, setSessionCookie } from "@/lib/session";
import { hostOf, isLocalHost } from "@/lib/hosts";

export const runtime = "nodejs";

// GET /api/auth/handoff?t=… — finishes "View as dealer" on the dealership's own address:
// trades the 60-second hand-off token for a dealer cookie here, then opens the portal.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const base = host && !isLocalHost(host) ? `https://${hostOf(host)}` : url.origin;
  const claims = await readHandoff(url.searchParams.get("t") || "");
  if (!claims) return NextResponse.redirect(new URL("/?handoff=expired", base));
  setSessionCookie(await createSession(claims), "dealer");
  return NextResponse.redirect(new URL("/portal/vehicle", base));
}
