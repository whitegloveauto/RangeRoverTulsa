import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm } from "@/lib/session";
import { loadActivity, uploadOrderPhoto, deleteOrderPhoto } from "@/lib/orderActivity";
import { emailOrderEvent } from "@/lib/dealerEmail";

export const runtime = "nodejs";

// GET ?quote_id= — photos + thread (WGA)
export async function GET(req: Request) {
  const s = await requireWgaPerm("orders");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  const quoteId = new URL(req.url).searchParams.get("quote_id") || "";
  if (!quoteId) return NextResponse.json({ error: "quote_id required" }, { status: 400 });
  return NextResponse.json(await loadActivity(quoteId));
}

// POST multipart { quote_id, files[] (QC photos), caption? }
// POST JSON { quote_id, action: "reply", body } | { action: "resolve", message_id } | { action: "delete_photo", photo_id }
export async function POST(req: Request) {
  const s = await requireWgaPerm("orders");
  if (!s) return NextResponse.json({ error: "No access." }, { status: 403 });
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const quoteId = String(form.get("quote_id") || "");
      const files = form.getAll("files").filter((f): f is File => f instanceof File);
      if (!quoteId || !files.length) return NextResponse.json({ error: "No photos." }, { status: 400 });
      for (const f of files) await uploadOrderPhoto(quoteId, f, "qc", s.userName, String(form.get("caption") || ""));
      await supabaseAdmin.from("dealer_order_events").insert({ quote_id: quoteId, event_type: "qc_photos", actor_name: s.userName, detail: `${files.length} QC photo(s) added` });
      await emailOrderEvent(quoteId, { kind: "qc", count: files.length });
      return NextResponse.json({ ok: true, added: files.length });
    }
    const b = await req.json();
    if (b.action === "reply") {
      const body = String(b.body || "").trim();
      if (!b.quote_id || !body) return NextResponse.json({ error: "Missing reply." }, { status: 400 });
      await supabaseAdmin.from("dealer_order_messages").insert({ quote_id: b.quote_id, kind: "reply", body, author_kind: "wga", author_name: s.userName, status: "done" });
      await emailOrderEvent(b.quote_id, { kind: "reply", body, author: s.userName });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "resolve") {
      await supabaseAdmin.from("dealer_order_messages").update({ status: "done", resolved_at: new Date().toISOString() }).eq("id", b.message_id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "reopen") {
      await supabaseAdmin.from("dealer_order_messages").update({ status: "open", resolved_at: null }).eq("id", b.message_id);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "delete_photo") {
      await deleteOrderPhoto(b.photo_id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
