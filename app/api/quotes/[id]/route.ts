import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { tenantByDealershipId } from "@/lib/tenant";

export const runtime = "nodejs";

// GET /api/quotes/[id] — fetch one quote owned by this dealership
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("dealer_quotes")
    .select("*")
    .eq("id", params.id)
    .eq("dealership_id", session.dealershipId) // scope: only own quotes
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  }

  // Timeline for the dealer: what happened and when (internal WGA notes are never included).
  const { data: events } = await supabaseAdmin
    .from("dealer_order_events")
    .select("event_type, from_status, to_status, actor_name, detail, created_at")
    .eq("quote_id", params.id)
    .order("created_at");

  const tenant = await tenantByDealershipId(session.dealershipId).catch(() => null);
  return NextResponse.json({
    quote: data,
    events: events || [],
    brand: tenant ? { name: tenant.brand.name, logo_url: tenant.brand.logo_url } : null,
    dealership: {
      name: session.name,
      brand: session.brand,
      location: session.location,
    },
  });
}
