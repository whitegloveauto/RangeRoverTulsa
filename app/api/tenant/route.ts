import { NextResponse } from "next/server";
import { currentTenant } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/tenant — which dealership owns this hostname (public: name + brand + theme only)
export async function GET() {
  const t = await currentTenant();
  if (!t) return NextResponse.json({ error: "No dealership is configured for this address." }, { status: 404 });
  return NextResponse.json({ dealership: { slug: t.dealership.slug, name: t.dealership.name, short_name: t.dealership.short_name, brand: t.dealership.brand, location: t.dealership.location }, brand: t.brand, theme: t.theme });
}
