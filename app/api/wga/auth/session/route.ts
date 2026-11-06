import { NextResponse } from "next/server";
import { getWgaSession } from "@/lib/session";
import { portalState } from "@/lib/wgaAuth";
export const runtime = "nodejs";
export async function GET() {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ authenticated: false }, { status: 401 });
  const st = s.userId ? await portalState(s.userId) : { mustChangePassword: false, hasPin: true };
  return NextResponse.json({
    authenticated: true,
    user: { name: s.userName, email: s.userEmail, role: s.role },
    mustChangePassword: st.mustChangePassword,
    hasPin: st.hasPin,
  });
}
