import { supabaseAdmin } from "@/lib/supabase";

// Fires the dealer-order-sm edge function, which creates the ShopMonkey RO for a submitted order
// and writes sm_order_id / sm_order_number (or sm_sync_error) back onto dealer_quotes.
// Best-effort: never throws, so a ShopMonkey hiccup can't block the dealer's submission.
export async function createShopMonkeyTicket(quoteId: string): Promise<{ ok: boolean; number?: string; error?: string }> {
  try {
    const url = process.env.SUPABASE_URL;
    if (!url) return { ok: false, error: "SUPABASE_URL not set" };
    const { data: row } = await supabaseAdmin.from("dealer_program_settings").select("value").eq("key", "sm_internal_token").maybeSingle();
    if (!row?.value) return { ok: false, error: "sm_internal_token not set" };

    const r = await fetch(`${url}/functions/v1/dealer-order-sm`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": row.value },
      body: JSON.stringify({ quote_id: quoteId }),
      signal: AbortSignal.timeout(25000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return { ok: false, error: j.error || `HTTP ${r.status}` };
    return { ok: true, number: j.sm_order_number ? String(j.sm_order_number) : undefined };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}
