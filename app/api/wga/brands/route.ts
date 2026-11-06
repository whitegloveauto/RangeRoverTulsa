import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaAdmin } from "@/lib/session";
import { DEFAULT_THEME } from "@/lib/theme";

export const runtime = "nodejs";
const BUCKET = "dealer-assets";

// GET — all manufacturer brand profiles
export async function GET() {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const { data } = await supabaseAdmin.from("dealer_brands").select("*").order("name");
  return NextResponse.json({ brands: data || [] });
}

// POST JSON  { key, name, make, tagline?, theme? (partial), copy_catalog_from? }  — create or update a brand
// POST multipart { key, file } — upload the brand badge
export async function POST(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  const ct = req.headers.get("content-type") || "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const key = String(form.get("key") || "").trim();
    const file = form.get("file") as File | null;
    if (!key || !file) return NextResponse.json({ error: "Brand and file are required." }, { status: 400 });
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(file.type)) return NextResponse.json({ error: "Use a PNG, JPG, WebP or SVG." }, { status: 400 });
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/svg+xml" ? "svg" : "jpg";
    const path = `brands/${key}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (upErr) return NextResponse.json({ error: "Upload failed: " + upErr.message }, { status: 500 });
    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    await supabaseAdmin.from("dealer_brands").update({ logo_light_url: pub.publicUrl, logo_dark_url: pub.publicUrl, updated_at: new Date().toISOString() }).eq("key", key);
    return NextResponse.json({ ok: true, url: pub.publicUrl });
  }

  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const key = String(b.key || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const name = String(b.name || "").trim();
  if (!key || !name) return NextResponse.json({ error: "Key and name are required." }, { status: 400 });
  const { data: existing } = await supabaseAdmin.from("dealer_brands").select("key, theme").eq("key", key).maybeSingle();
  const theme = { ...(existing ? existing.theme : DEFAULT_THEME), ...(b.theme || {}) };
  const row: any = { key, name, make: b.make || name, tagline: b.tagline ?? null, theme, updated_at: new Date().toISOString() };
  if (!existing) row.logo_light_url = row.logo_dark_url = b.logo_url || "/wga-white.png";
  const { error } = await supabaseAdmin.from("dealer_brands").upsert(row, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "Could not save brand." }, { status: 500 });

  // New brand: clone the services + packages (not models, not pricing) from another brand so it isn't empty.
  if (!existing && b.copy_catalog_from) {
    const { data: svcs } = await supabaseAdmin.from("dealer_services").select("*").eq("brand_key", b.copy_catalog_from).order("sort_order");
    for (const svc of svcs || []) {
      const { id: oldId, created_at, updated_at, ...rest } = svc as any;
      const { data: ns } = await supabaseAdmin.from("dealer_services").insert({ ...rest, brand: row.make, brand_key: key, key: `${rest.key}-${key}` }).select("id").single();
      if (!ns) continue;
      const { data: items } = await supabaseAdmin.from("dealer_service_items").select("*").eq("service_id", oldId);
      if (items?.length) await supabaseAdmin.from("dealer_service_items").insert(items.map(({ id, created_at, updated_at, ...it }: any) => ({ ...it, service_id: ns.id })));
    }
  }
  return NextResponse.json({ ok: true, key });
}
