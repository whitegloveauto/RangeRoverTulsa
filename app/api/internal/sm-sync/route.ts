import { NextResponse } from "next/server";
import { checkInternalKey } from "@/lib/internalKey";
import { runShopMonkeySync } from "@/lib/smSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called every 10 minutes by netlify/functions/sm-sync.mjs.
export async function POST(req: Request) {
  if (!checkInternalKey(req.headers.get("x-internal-key"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runShopMonkeySync();
  return NextResponse.json({ ok: r.ok, checked: (r as any).checked ?? 0, changed: (r as any).changed ?? 0, error: (r as any).error });
}
