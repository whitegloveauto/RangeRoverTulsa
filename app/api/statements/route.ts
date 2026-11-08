import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildStatement, csvResponse } from "@/lib/statements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?month=YYYY-MM[&format=csv] — the signed-in dealership's statement (dealer admins)
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (s.role !== "admin") return NextResponse.json({ error: "Dealership admins only." }, { status: 403 });
  const url = new URL(req.url);
  const st = await buildStatement(s.dealershipId, url.searchParams.get("month") || "");
  if (!st) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (url.searchParams.get("format") === "csv") return csvResponse(st, true);
  return NextResponse.json({ statement: st });
}
