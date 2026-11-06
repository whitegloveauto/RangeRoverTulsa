import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireWgaPerm } from "@/lib/session";
import { selectedDealership } from "@/lib/wgaContext";

export const runtime = "nodejs";

const brandOf = async () => (await selectedDealership())?.brand || "Range Rover";

// GET /api/wga/vehicles — every catalog row (active + inactive) for the admin grid
export async function GET() {
  const s = await requireWgaPerm("vehicles");
  if (!s) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  const BRAND = await brandOf();
  const { data, error } = await supabaseAdmin
    .from("dealer_vehicles")
    .select("id, year, model, trim, sort_order, active")
    .eq("brand", BRAND)
    .order("year", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("trim", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load vehicles." }, { status: 500 });
  return NextResponse.json({ vehicles: data || [] });
}

// POST /api/wga/vehicles — { action, ... }
//  trim.create      { year, model, trim }
//  trim.update      { id, trim?, active? }
//  trim.delete      { id }
//  model.copyYear   { fromYear, toYear }            copies every active model/trim of one year to a new year
//  model.rename     { model, newName }              renames a model across all years (pricing rows follow)
//  model.setActive  { model, year?, active }        hide/show a whole model (optionally one year)
export async function POST(req: Request) {
  const s = await requireWgaPerm("vehicles");
  if (!s) return NextResponse.json({ error: "You don't have access to this." }, { status: 403 });
  const BRAND = await brandOf();
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const fail = (msg: string, code = 500) => NextResponse.json({ error: msg }, { status: code });
  const clean = (v: any) => String(v ?? "").trim();

  switch (b.action) {
    case "trim.create": {
      const year = Number(b.year);
      const model = clean(b.model);
      const trim = clean(b.trim);
      if (!year || !model || !trim) return fail("Year, model and trim are required.", 400);
      // keep the model's existing sort_order if it has one
      const { data: sib } = await supabaseAdmin.from("dealer_vehicles").select("sort_order").eq("brand", BRAND).eq("model", model).limit(1);
      let sort_order = sib?.[0]?.sort_order;
      if (sort_order === undefined || sort_order === null) {
        const { data: max } = await supabaseAdmin.from("dealer_vehicles").select("sort_order").eq("brand", BRAND).order("sort_order", { ascending: false }).limit(1);
        sort_order = (max?.[0]?.sort_order ?? 0) + 10;
      }
      const { error } = await supabaseAdmin.from("dealer_vehicles").insert({ brand: BRAND, year, model, trim, sort_order, active: true });
      if (error) return fail(error.code === "23505" ? "That year / model / trim already exists." : "Could not add trim.");
      return NextResponse.json({ ok: true });
    }
    case "trim.update": {
      if (!b.id) return fail("Missing id.", 400);
      const patch: any = {};
      if (b.trim !== undefined) patch.trim = clean(b.trim);
      if (b.active !== undefined) patch.active = !!b.active;
      const { error } = await supabaseAdmin.from("dealer_vehicles").update(patch).eq("id", b.id);
      if (error) return fail("Could not update trim.");
      return NextResponse.json({ ok: true });
    }
    case "trim.delete": {
      if (!b.id) return fail("Missing id.", 400);
      const { error } = await supabaseAdmin.from("dealer_vehicles").delete().eq("id", b.id);
      if (error) return fail("Could not delete trim.");
      return NextResponse.json({ ok: true });
    }
    case "model.copyYear": {
      const fromYear = Number(b.fromYear);
      const toYear = Number(b.toYear);
      if (!fromYear || !toYear || fromYear === toYear) return fail("Pick two different years.", 400);
      const { data: src } = await supabaseAdmin.from("dealer_vehicles").select("model, trim, sort_order").eq("brand", BRAND).eq("year", fromYear).eq("active", true);
      if (!src?.length) return fail(`No active vehicles found for ${fromYear}.`, 400);
      const { data: existing } = await supabaseAdmin.from("dealer_vehicles").select("model, trim").eq("brand", BRAND).eq("year", toYear);
      const have = new Set((existing || []).map((r) => `${r.model}|${r.trim}`));
      const rows = src.filter((r) => !have.has(`${r.model}|${r.trim}`)).map((r) => ({ brand: BRAND, year: toYear, model: r.model, trim: r.trim, sort_order: r.sort_order, active: true }));
      if (rows.length) {
        const { error } = await supabaseAdmin.from("dealer_vehicles").insert(rows);
        if (error) return fail("Could not copy year.");
      }
      return NextResponse.json({ ok: true, added: rows.length });
    }
    case "model.rename": {
      const model = clean(b.model);
      const newName = clean(b.newName);
      if (!model || !newName || model === newName) return fail("Model and new name are required.", 400);
      const { error } = await supabaseAdmin.from("dealer_vehicles").update({ model: newName }).eq("brand", BRAND).eq("model", model);
      if (error) return fail("Could not rename model.");
      // pricing is keyed by model name — carry it over so nothing goes blank
      await supabaseAdmin.from("dealer_model_pricing").update({ model: newName }).eq("brand", BRAND).eq("model", model);
      await supabaseAdmin.from("dealer_retail_prices").update({ model: newName }).eq("model", model);
      return NextResponse.json({ ok: true });
    }
    case "model.setActive": {
      const model = clean(b.model);
      if (!model) return fail("Model is required.", 400);
      let q = supabaseAdmin.from("dealer_vehicles").update({ active: !!b.active }).eq("brand", BRAND).eq("model", model);
      if (b.year) q = q.eq("year", Number(b.year));
      const { error } = await q;
      if (error) return fail("Could not update model.");
      return NextResponse.json({ ok: true });
    }
    default:
      return fail("Unknown action.", 400);
  }
}
