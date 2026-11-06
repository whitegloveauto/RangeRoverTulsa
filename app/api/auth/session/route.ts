import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { tenantByDealershipId } from "@/lib/tenant";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const t = await tenantByDealershipId(session.dealershipId).catch(() => null);
  return NextResponse.json({
    authenticated: true,
    dealership: { name: session.name, brand: session.brand, location: session.location, short_name: t?.dealership.short_name || session.name },
    brand: t?.brand || null,
    theme: t?.theme || null,
    user: { name: session.userName, email: session.userEmail, role: session.role, canSeeCost: session.canSeeCost },
    viewAs: session.viewAs || null,
  });
}
