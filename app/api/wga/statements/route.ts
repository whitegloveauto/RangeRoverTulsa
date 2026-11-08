import { NextResponse } from "next/server";
import { requireWgaPerm } from "@/lib/session";
import { selectedDealership } from "@/lib/wgaContext";
import { buildStatement, csvResponse } from "@/lib/statements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?dealership=<id>&month=YYYY-MM[&format=csv] — WGA view of a dealership's monthly statement
export async function GET(req: Request) {
  const s = await requireWgaPerm("orders");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  const url = new URL(req.url);
  const id = url.searchParams.get("dealership") || (await selectedDealership())?.id;
  if (!id) return NextResponse.json({ error: "Pick a dealership." }, { status: 400 });
  const st = await buildStatement(id, url.searchParams.get("month") || "");
  if (!st) return NextResponse.json({ error: "Dealership not found." }, { status: 404 });
  if (url.searchParams.get("format") === "csv") return csvResponse(st, true);
  return NextResponse.json({ statement: st });
}
