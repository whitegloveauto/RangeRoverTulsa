import { NextResponse } from "next/server";
import { getWgaSession } from "@/lib/session";
export const runtime = "nodejs";
export async function GET() {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, user: { name: s.userName, email: s.userEmail, role: s.role } });
}
