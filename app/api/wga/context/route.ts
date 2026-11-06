import { NextResponse } from "next/server";
import { getWgaSession } from "@/lib/session";
import { listDealerships, selectedDealership, setSelectedDealership } from "@/lib/wgaContext";

export const runtime = "nodejs";

// GET — all dealerships + the one this admin is currently working on
export async function GET() {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const [dealerships, selected] = await Promise.all([listDealerships(), selectedDealership()]);
  return NextResponse.json({ dealerships, selected });
}

// POST { id } — switch the working dealership
export async function POST(req: Request) {
  const s = await getWgaSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  const all = await listDealerships();
  if (!all.find((d) => d.id === id)) return NextResponse.json({ error: "Unknown dealership." }, { status: 400 });
  setSelectedDealership(id);
  return NextResponse.json({ ok: true });
}
