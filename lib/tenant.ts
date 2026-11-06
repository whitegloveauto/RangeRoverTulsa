import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_THEME, type BrandTheme } from "@/lib/theme";
export { DEFAULT_THEME, WGA_THEME, themeCss, fontHref, type BrandTheme } from "@/lib/theme";

// Multi-dealer tenancy. A dealership is resolved from the request hostname
// (dealer_dealerships.hostnames); its brand profile (dealer_brands) supplies the
// theme and logos, with dealer_dealerships.theme_override / logo_url on top.

export interface Tenant {
  dealership: { id: string; slug: string; name: string; short_name: string; brand: string; brand_key: string; location: string | null; hide_cost_from_users: boolean };
  brand: { key: string; name: string; make: string; logo_url: string; tagline: string | null };
  theme: BrandTheme;
}

const SELECT = "id, slug, name, short_name, brand, brand_key, location, hide_cost_from_users, logo_url, theme_override, hostnames, active";

function build(d: any, b: any): Tenant {
  const theme: BrandTheme = { ...DEFAULT_THEME, ...((b?.theme as Partial<BrandTheme>) || {}), ...((d?.theme_override as Partial<BrandTheme>) || {}) };
  return {
    dealership: { id: d.id, slug: d.slug, name: d.name, short_name: d.short_name || d.name, brand: d.brand, brand_key: d.brand_key || "land-rover", location: d.location, hide_cost_from_users: !!d.hide_cost_from_users },
    brand: { key: b?.key || d.brand_key || "land-rover", name: b?.name || d.brand, make: b?.make || d.brand, logo_url: d.logo_url || b?.logo_light_url || "/landrover.png", tagline: b?.tagline || null },
    theme,
  };
}

async function brandFor(key: string | null) {
  if (!key) return null;
  const { data } = await supabaseAdmin.from("dealer_brands").select("*").eq("key", key).maybeSingle();
  return data;
}

export async function tenantByDealershipId(id: string): Promise<Tenant | null> {
  const { data: d } = await supabaseAdmin.from("dealer_dealerships").select(SELECT).eq("id", id).maybeSingle();
  if (!d) return null;
  return build(d, await brandFor(d.brand_key));
}

export async function tenantByHost(host: string | null): Promise<Tenant | null> {
  const h = (host || "").toLowerCase().split(":")[0];
  let d: any = null;
  if (h) {
    const r = await supabaseAdmin.from("dealer_dealerships").select(SELECT).contains("hostnames", [h]).eq("active", true).maybeSingle();
    d = r.data;
  }
  if (!d) {
    // default tenant: dealer_program_settings.default_dealership_slug, else the first active dealership
    const { data: s } = await supabaseAdmin.from("dealer_program_settings").select("value").eq("key", "default_dealership_slug").maybeSingle();
    let r = s?.value ? await supabaseAdmin.from("dealer_dealerships").select(SELECT).eq("slug", s.value).maybeSingle() : { data: null };
    if (!r.data) r = await supabaseAdmin.from("dealer_dealerships").select(SELECT).eq("active", true).order("created_at").limit(1).maybeSingle();
    d = r.data;
  }
  if (!d) return null;
  return build(d, await brandFor(d.brand_key));
}

// Current request's tenant (server components / route handlers).
export async function currentTenant(): Promise<Tenant | null> {
  return tenantByHost(headers().get("x-forwarded-host") || headers().get("host"));
}

