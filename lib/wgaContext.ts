import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase";

// Which dealership the WGA admin is currently working on (pricing, vehicles, settings).
// Stored in a cookie; falls back to the first active dealership.
export const WGA_DEALER_COOKIE = "wga_dealership";

export interface WgaDealership { id: string; slug: string; name: string; short_name: string | null; brand: string; brand_key: string | null; location: string | null; active: boolean }

export async function listDealerships(): Promise<WgaDealership[]> {
  const { data } = await supabaseAdmin.from("dealer_dealerships").select("id, slug, name, short_name, brand, brand_key, location, active").order("created_at");
  return (data || []) as WgaDealership[];
}

export async function selectedDealership(): Promise<WgaDealership | null> {
  const all = await listDealerships();
  const id = cookies().get(WGA_DEALER_COOKIE)?.value;
  return all.find((d) => d.id === id) || all.find((d) => d.active) || all[0] || null;
}

export function setSelectedDealership(id: string) {
  cookies().set(WGA_DEALER_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 3600, secure: process.env.NODE_ENV === "production" });
}
