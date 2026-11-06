import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadPacket, ensurePacketToken } from "@/lib/packet";

export const runtime = "nodejs";

// GET /api/quotes/[id]/packet — packet data + the public share link for this quote
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const data = await loadPacket({ id: params.id, dealershipId: s.dealershipId });
  if (!data) return NextResponse.json({ error: "Quote not found." }, { status: 404 });
  const token = await ensurePacketToken(params.id);
  const origin = new URL(req.url).origin;
  const shareUrl = token ? `${origin}/p/${token}` : null;
  return NextResponse.json({ data, shareUrl });
}
