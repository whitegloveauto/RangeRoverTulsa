import { headers } from "next/headers";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_THEME, type BrandTheme } from "@/lib/theme";
import { brandLogos } from "@/lib/brandLogo";
export { DEFAULT_THEME, WGA_THEME, themeCss, fontHref, type BrandTheme } from "@/lib/theme";

// Multi-dealer tenancy. A dealership is resolved from the request hostname
// (dealer_dealerships.hostnames); its brand profile (dealer_brands) supplies the
// theme and logos, with dealer_dealerships.theme_override / logo_url on top.

export interface Tenant {
  dealership: { id: string; slug: string; name: string; short_name: string; brand: string; brand_key: string; location: string | null; hide_cost_from_users: boolean };
  brand: { key: string; name: string; make: string; logo_url: string; logo_paper_url: string; tagline: string | null };
  theme: BrandTheme;
}

const SELECT = "id, slug, name, short_name, brand, brand_key, location, hide_cost_from_users, logo_url, theme_override, hostnames, active";

function build(d: any, b: any): Tenant {
  const theme: BrandTheme = { ...DEFAULT_THEME, ...((b?.theme as Partial<BrandTheme>) || {}), ...((d?.theme_override as Partial<BrandTheme>) || {}) };
  return {
    dealership: { id: d.id, slug: d.slug, name: d.name, short_name: d.short_name || d.name, brand: d.brand, brand_key: d.brand_key || "land-rover", location: d.location, hide_cost_from_users: !!d.hide_cost_from_users },
    brand: (() => {
      const key = b?.key || d.brand_key || "land-rover";
      const logos = brandLogos({ key, make: b?.make || d.brand, name: b?.name || d.brand, logo_light_url: b?.logo_light_url }, d.logo_url, { wgaFallback: false });
      return { key, name: b?.name || d.brand, make: b?.make || d.brand, logo_url: logos.screen, logo_paper_url: logos.paper, tagline: b?.tagline || null };
    })(),
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

// Every page asks for the tenant several times (metadata, viewport, layout). Dedupe within a request
// (React cache) and keep it for a minute on a warm server, so a page load isn't 6+ database trips.
const TENANT_TTL = 60_000;
const tenantMemo = new Map<string, { at: number; t: Promise<Tenant | null> }>();

export const tenantByHost = cache(async (host: string | null): Promise<Tenant | null> => {
  const key = (host || "").toLowerCase().split(":")[0];
  const hit = tenantMemo.get(key);
  if (hit && Date.now() - hit.at < TENANT_TTL) return hit.t;
  const t = loadTenantByHost(key).catch((e) => {
    tenantMemo.delete(key);
    throw e;
  });
  tenantMemo.set(key, { at: Date.now(), t });
  return t;
});

async function loadTenantByHost(host: string): Promise<Tenant | null> {
  const h = host;
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

