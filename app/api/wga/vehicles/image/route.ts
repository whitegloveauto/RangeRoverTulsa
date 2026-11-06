import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaAdmin } from "@/lib/session";

export const runtime = "nodejs";
const BRAND = "Range Rover";
const BUCKET = "dealer-assets";

// GET — { images: { [model]: url } }
export async function GET() {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { data } = await supabaseAdmin.from("dealer_model_images").select("model, image_url").eq("brand", BRAND);
  const images: Record<string, string> = {};
  for (const r of data || []) images[r.model] = r.image_url;
  return NextResponse.json({ images });
}

// POST multipart { model, file } — upload/replace the photo used on the customer packet for this model
export async function POST(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const form = await req.formData();
  const model = String(form.get("model") || "").trim();
  const file = form.get("file") as File | null;
  if (!model || !file) return NextResponse.json({ error: "Model and file are required." }, { status: 400 });
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return NextResponse.json({ error: "Use a PNG, JPG or WebP image." }, { status: 400 });
  if (file.size > 6 * 1024 * 1024) return NextResponse.json({ error: "Image must be under 6 MB." }, { status: 400 });
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `models/${model.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });
  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const { error } = await supabaseAdmin.from("dealer_model_images").upsert({ brand: BRAND, model, image_url: pub.publicUrl, updated_at: new Date().toISOString() }, { onConflict: "brand,model" });
  if (error) return NextResponse.json({ error: "Could not save image." }, { status: 500 });
  return NextResponse.json({ ok: true, url: pub.publicUrl });
}

// DELETE { model } — remove the photo (packet falls back to the diagram)
export async function DELETE(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { model } = await req.json().catch(() => ({}));
  if (!model) return NextResponse.json({ error: "Model required." }, { status: 400 });
  await supabaseAdmin.from("dealer_model_images").delete().eq("brand", BRAND).eq("model", model);
  return NextResponse.json({ ok: true });
}
