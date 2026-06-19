import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";

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

  return NextResponse.json({
    quote: data,
    dealership: {
      name: session.name,
      brand: session.brand,
      location: session.location,
    },
  });
}
