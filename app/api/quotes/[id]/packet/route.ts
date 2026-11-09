import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadPacket } from "@/lib/packet";
import { supabaseAdmin } from "@/lib/supabase";
import { canViewQuote } from "@/lib/dealerAccess";

export const runtime = "nodejs";

// GET /api/quotes/[id]/packet — the quote document data (no customer share link: dealers print/save the PDF)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { data: own } = await supabaseAdmin.from("dealer_quotes").select("dealer_user_id").eq("id", params.id).eq("dealership_id", s.dealershipId).maybeSingle();
  if (!own || !canViewQuote(s, own)) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  const data = await loadPacket({ id: params.id, dealershipId: s.dealershipId });
  if (!data) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  return NextResponse.json({ data });
}
