import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaAdmin } from "@/lib/session";

export const runtime = "nodejs";

// Services + items CRUD (WGA admins).
// POST body: { action, ...fields }
//  service.create  {name, note}
//  service.update  {id, name?, note?, active?, sort_order?}
//  item.create     {service_id, name, description?}
//  item.update     {id, name?, description?, active?, sort_order?}
//  item.delete     {id}  (removes pricing for it too, via cascade)
export async function POST(req: Request) {
  const s = await requireWgaAdmin();
  if (!s) return NextResponse.json({ error: "Admins only." }, { status: 403 });
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const fail = (msg: string, code = 500) => NextResponse.json({ error: msg }, { status: code });

  switch (b.action) {
    case "service.create": {
      const name = String(b.name || "").trim();
      if (!name) return fail("Service name is required.", 400);
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + Date.now().toString(36);
      const { data: max } = await supabaseAdmin.from("dealer_services").select("sort_order").eq("brand", "Range Rover").order("sort_order", { ascending: false }).limit(1);
      const { data, error } = await supabaseAdmin
        .from("dealer_services")
        .insert({ brand: "Range Rover", key, name, note: b.note || null, sort_order: ((max?.[0]?.sort_order as number) || 0) + 1 })
        .select("*")
        .single();
      if (error) return fail("Could not create service.");
      return NextResponse.json({ ok: true, service: data });
    }
    case "service.update": {
      if (!b.id) return fail("Missing id.", 400);
      const patch: any = {};
      if (b.name !== undefined) patch.name = String(b.name).trim();
      if (b.note !== undefined) patch.note = b.note || null;
      if (b.active !== undefined) patch.active = !!b.active;
      if (b.sort_order !== undefined) patch.sort_order = Number(b.sort_order);
      if (b.product_name !== undefined) patch.product_name = b.product_name || null;
      if (b.blurb !== undefined) patch.blurb = b.blurb || null;
      if (b.facts !== undefined) patch.facts = Array.isArray(b.facts) ? b.facts.map((f: any) => String(f).trim()).filter(Boolean) : String(b.facts).split("\n").map((f) => f.trim()).filter(Boolean);
      const { error } = await supabaseAdmin.from("dealer_services").update(patch).eq("id", b.id);
      if (error) return fail("Could not update service.");
      return NextResponse.json({ ok: true });
    }
    case "item.create": {
      const name = String(b.name || "").trim();
      if (!b.service_id || !name) return fail("Service and package name are required.", 400);
      const { data: max } = await supabaseAdmin.from("dealer_service_items").select("sort_order").eq("service_id", b.service_id).order("sort_order", { ascending: false }).limit(1);
      const { data, error } = await supabaseAdmin
        .from("dealer_service_items")
        .insert({ service_id: b.service_id, name, description: b.description || null, sort_order: ((max?.[0]?.sort_order as number) || 0) + 1 })
        .select("*")
        .single();
      if (error) return fail("Could not create package.");
      return NextResponse.json({ ok: true, item: data });
    }
    case "item.update": {
      if (!b.id) return fail("Missing id.", 400);
      const patch: any = {};
      if (b.name !== undefined) patch.name = String(b.name).trim();
      if (b.description !== undefined) patch.description = b.description || null;
      if (b.active !== undefined) patch.active = !!b.active;
      if (b.sort_order !== undefined) patch.sort_order = Number(b.sort_order);
      if (b.zones !== undefined) patch.zones = Array.isArray(b.zones) ? b.zones.map(String) : [];
      if (b.blurb !== undefined) patch.blurb = b.blurb || null;
      const { error } = await supabaseAdmin.from("dealer_service_items").update(patch).eq("id", b.id);
      if (error) return fail("Could not update package.");
      return NextResponse.json({ ok: true });
    }
    case "item.delete": {
      if (!b.id) return fail("Missing id.", 400);
      const { error } = await supabaseAdmin.from("dealer_service_items").delete().eq("id", b.id);
      if (error) return fail("Could not delete package.");
      return NextResponse.json({ ok: true });
    }
    default:
      return fail("Unknown action.", 400);
  }
}
