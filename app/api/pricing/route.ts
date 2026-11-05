import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadPricingBook } from "@/lib/pricingBook";

export const runtime = "nodejs";

// GET /api/pricing — the dealership's pricing book (their retail, plus WGA cost if allowed)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const book = await loadPricingBook({
    brand: session.brand,
    dealershipId: session.dealershipId,
    canSeeCost: session.canSeeCost,
  });
  return NextResponse.json(book);
}
