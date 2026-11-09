import { NextResponse } from "next/server";
import { authClient, loadProfile, portalState, nextPath, issueSession, issueDeviceCookie, explainSignInFailure } from "@/lib/wgaAuth";

export const runtime = "nodejs";

// White Glove Auto sign-in with email + password (Supabase Auth + profiles).
// On success this browser becomes a trusted device, so future sign-ins can use the PIN.
export async function POST(req: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  const { data: signIn, error: signErr } = await authClient().auth.signInWithPassword({ email, password });
  if (signErr || !signIn.user) {
    const f = await explainSignInFailure(email, signErr, "sign-in");
    return NextResponse.json({ error: f.error }, { status: f.status });
  }

  const p = await loadProfile(email);
  if (typeof p === "string") return NextResponse.json({ error: p }, { status: 403 });

  const st = await portalState(p.id);
  await issueSession(p);
  await issueDeviceCookie(p.id, req.headers.get("user-agent"));
  return NextResponse.json({ ok: true, next: nextPath(p, st), user: { name: p.full_name, role: p.role } });
}
