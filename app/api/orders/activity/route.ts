import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/session";
import { loadActivity, uploadOrderPhoto } from "@/lib/orderActivity";
import { notifyWga } from "@/lib/notify";
import { canViewQuote } from "@/lib/dealerAccess";
import type { SessionClaims } from "@/lib/types";

export const runtime = "nodejs";

async function ownQuote(quoteId: string, s: SessionClaims) {
  const { data } = await supabaseAdmin.from("dealer_quotes").select("id, quote_number, status, vehicle_year, vehicle_model, vehicle_trim, sm_order_number, dealer_user_id").eq("id", quoteId).eq("dealership_id", s.dealershipId).maybeSingle();
  return data && canViewQuote(s, data) ? data : null;
}

// GET ?quote_id= — photos + request thread for one of this dealership's orders
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const quoteId = new URL(req.url).searchParams.get("quote_id") || "";
  const q = await ownQuote(quoteId, s);
  if (!q) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(await loadActivity(quoteId));
}

// POST JSON { quote_id, body } — dealer adds a change request / note to a submitted order
// POST multipart { quote_id, file, caption? } — dealer attaches a photo (e.g. showing an issue)
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const quoteId = String(form.get("quote_id") || "");
      const q = await ownQuote(quoteId, s);
      if (!q) return NextResponse.json({ error: "Not found." }, { status: 404 });
      const file = form.get("file") as File | null;
      if (!file) return NextResponse.json({ error: "No file." }, { status: 400 });
      await uploadOrderPhoto(quoteId, file, "issue", s.userName, String(form.get("caption") || ""));
      return NextResponse.json({ ok: true });
    }
    const b = await req.json();
    const quoteId = String(b.quote_id || "");
    const body = String(b.body || "").trim();
    if (!body) return NextResponse.json({ error: "Write the request first." }, { status: 400 });
    const q = await ownQuote(quoteId, s);
    if (!q) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (q.status === "draft") return NextResponse.json({ error: "Submit the order first — drafts can still be edited directly." }, { status: 400 });
    const { error } = await supabaseAdmin.from("dealer_order_messages").insert({ quote_id: quoteId, kind: "request", body, author_kind: "dealer", author_name: s.userName, status: "open" });
    if (error) return NextResponse.json({ error: "Could not save request." }, { status: 500 });
    await supabaseAdmin.from("dealer_order_events").insert({ quote_id: quoteId, event_type: "request", actor_name: s.userName, detail: body.slice(0, 200) });
    await notifyWga(
      `Change request · ${q.sm_order_number ? `RO ${q.sm_order_number}` : q.quote_number}`,
      `${s.name}: ${q.vehicle_year} ${q.vehicle_model} ${q.vehicle_trim} — ${body.slice(0, 140)}`,
      { quote_id: quoteId, quote_number: q.quote_number, kind: "request" }
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
