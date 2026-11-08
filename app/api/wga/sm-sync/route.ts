import { NextResponse } from "next/server";
import { requireWgaPerm } from "@/lib/session";
import { runShopMonkeySync } from "@/lib/smSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { dry?: boolean } — run the ShopMonkey status sync now and show what it saw.
export async function POST(req: Request) {
  const s = await requireWgaPerm("orders");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = await runShopMonkeySync({ dry: !!b.dry });
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
