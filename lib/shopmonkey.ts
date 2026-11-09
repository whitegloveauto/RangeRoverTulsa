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

// ---- Dealer order number → ShopMonkey vehicle "Unit" field ------------------------------------
// ShopMonkey keeps "Unit" on the vehicle (PUT /v3/vehicle/:id { unit }). We write the dealer's
// order number (e.g. Q-20261109-AB12) there so the shop can match the RO to the dealer's order.
// Goes through the dealer-order-sm edge function's raw probe (the ShopMonkey key never leaves
// Supabase), then reads the vehicle back to confirm. Result is remembered per order
// (dealer_program_settings sm-unit:<quoteId>) so it's done once; failures retry after 6 hours.

async function smToken(): Promise<string> {
  const { data } = await supabaseAdmin.from("dealer_program_settings").select("value").eq("key", "sm_internal_token").maybeSingle();
  return data?.value ? String(data.value) : "";
}

export async function smRaw(token: string, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/dealer-order-sm`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": token },
    body: JSON.stringify({ probe: "raw", method, path, ...(body !== undefined ? { body, json: body, payload: body } : {}) }),
    signal: AbortSignal.timeout(12000),
  });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.ok, status: j.status ?? r.status, data: j.data?.data ?? j.data, error: j.error };
}

const unitKey = (quoteId: string) => `sm-unit:${quoteId}`;

export async function setShopMonkeyUnit(quoteId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; note: string }> {
  try {
    const { data: q } = await supabaseAdmin.from("dealer_quotes").select("quote_number, sm_order_id").eq("id", quoteId).maybeSingle();
    if (!q?.sm_order_id) return { ok: false, note: "no ShopMonkey RO yet" };
    const { data: mark } = await supabaseAdmin.from("dealer_program_settings").select("value").eq("key", unitKey(quoteId)).maybeSingle();
    const prev = mark?.value ? (typeof mark.value === "string" ? JSON.parse(mark.value) : mark.value) : null;
    if (!opts.force && prev?.ok && prev.unit === q.quote_number) return { ok: true, note: "already set" };
    if (!opts.force && prev && !prev.ok && Date.now() - Date.parse(prev.at) < 6 * 3600000) return { ok: false, note: `waiting to retry (${prev.note})` };

    const token = await smToken();
    if (!token) return { ok: false, note: "sm_internal_token not set" };
    const remember = async (ok: boolean, note: string) => {
      await supabaseAdmin.from("dealer_program_settings").upsert({ key: unitKey(quoteId), value: JSON.stringify({ ok, note, unit: q.quote_number, at: new Date().toISOString() }) }, { onConflict: "key" });
      console.log(`[sm unit] ${q.quote_number} ${ok ? "OK" : "FAILED"} — ${note}`);
      return { ok, note };
    };
    const ro = await smRaw(token, "GET", `/order/${encodeURIComponent(q.sm_order_id)}`);
    const vehicleId = ro.data?.vehicleId ?? ro.data?.vehicle?.id;
    if (!ro.ok || !vehicleId) return remember(false, `couldn't read the RO's vehicle (ShopMonkey ${ro.status})`);
    const before = await smRaw(token, "GET", `/vehicle/${encodeURIComponent(vehicleId)}`);
    if (before.ok && String(before.data?.unit ?? "") === q.quote_number) return remember(true, "unit already matches");
    const put = await smRaw(token, "PUT", `/vehicle/${encodeURIComponent(vehicleId)}`, { unit: q.quote_number });
    const after = await smRaw(token, "GET", `/vehicle/${encodeURIComponent(vehicleId)}`);
    if (after.ok && String(after.data?.unit ?? "") === q.quote_number) return remember(true, `unit set on vehicle ${vehicleId}`);
    return remember(false, `PUT /vehicle → ${put.status}${put.error ? ` ${String(put.error).slice(0, 120)}` : ""}; unit still "${after.data?.unit ?? ""}"`);
  } catch (e: any) {
    console.log(`[sm unit] error ${String(e?.message || e)}`);
    return { ok: false, note: String(e?.message || e) };
  }
}
