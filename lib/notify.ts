import { supabaseAdmin } from "./supabase";

// Fire a push to WGA Command (admins + anyone with dealer_deals access) via the
// existing `send-push` Edge Function. Best-effort: never blocks or fails the request.
export async function notifyWga(title: string, body: string, data?: Record<string, unknown>) {
  try {
    const url = `${process.env.SUPABASE_URL}/functions/v1/send-push`;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ title, body, audience: "dealer_deals", data: { screen: "dealer_deals", ...(data || {}) } }),
      signal: controller.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export { supabaseAdmin };
