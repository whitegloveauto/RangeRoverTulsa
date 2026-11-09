import { supabaseAdmin } from "@/lib/supabase";
import { loadPricingBook } from "@/lib/pricingBook";
import { notifyWga } from "@/lib/notify";
import { createShopMonkeyTicket } from "@/lib/shopmonkey";
import type { OrderLine } from "@/lib/types";
import { pickOneConflict } from "@/lib/serviceGroups";

// Shared by "Submit order" on the pricing page and "Submit" on a saved quote.

export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const normVin = (v: unknown) => (typeof v === "string" ? v.replace(/[^A-Za-z0-9]/g, "").toUpperCase() : "");
export const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// Urgency from how tight the window is (today → needed_by): <3 days urgent, <7 soon, else normal.
export function urgencyFor(needDate: string | null) {
  const daysUntil = needDate ? Math.ceil((new Date(needDate + "T00:00:00").getTime() - Date.now()) / 86400000) : null;
  return daysUntil === null ? "normal" : daysUntil < 3 ? "urgent" : daysUntil < 7 ? "soon" : "normal";
}

// Same car already ordered in the last 30 days (by VIN)? Returns what the dealer needs to decide.
export async function findDuplicate(dealershipId: string, vin: string, excludeId?: string) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  let q = supabaseAdmin
    .from("dealer_quotes")
    .select("id, quote_number, status, submitted_at, dealer_user_name, line_items, sm_order_number")
    .eq("dealership_id", dealershipId)
    .not("status", "in", "(draft,cancelled)")
    .gte("submitted_at", since)
    .ilike("vehicle_vin", vin)
    .order("submitted_at", { ascending: false })
    .limit(3);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  const d = data?.[0];
  if (!d) return null;
  return {
    id: d.id,
    quote_number: d.quote_number,
    status: d.status,
    submitted_at: d.submitted_at,
    by: d.dealer_user_name,
    ro: d.sm_order_number,
    match: "VIN",
    services: (Array.isArray(d.line_items) ? d.line_items : []).map((l: any) => l.name).join(", "),
  };
}

// Current prices for these items on this model, from the authoritative book (always with cost).
// Also enforces "pick one" per category / group.
export async function priceLines(brand: string, dealershipId: string, model: string, ids: string[]): Promise<{ lines: OrderLine[]; conflict: string | null } | { error: string }> {
  const book = await loadPricingBook({ brand, dealershipId, canSeeCost: true });
  const lines: OrderLine[] = [];
  for (const svc of book.services) {
    for (const it of svc.items) {
      if (!ids.includes(it.id)) continue;
      const cell = book.prices[model]?.[it.id];
      if (!cell || cell.cost === null) return { error: `"${it.name}" is not priced yet for ${model}.` };
      lines.push({ item_id: it.id, service: svc.name, name: it.name, cost: cell.cost, retail: cell.retail ?? cell.cost });
    }
  }
  if (!lines.length) return { error: "Selected services were not found." };
  return { lines, conflict: pickOneConflict(lines, book.services) };
}

// Everything that happens once an order is submitted: timeline event, ShopMonkey ticket, push to WGA.
export async function afterSubmit(
  session: { userName: string; name: string; brand: string },
  quote: { id: string; quote_number: string; vehicle_year: number | string; vehicle_model: string; vehicle_trim: string },
  lines: OrderLine[],
  needDate: string | null,
  urgency: string,
  detail?: string
) {
  const costTotal = lines.reduce((s, l) => s + l.cost, 0);
  await supabaseAdmin.from("dealer_order_events").insert({
    quote_id: quote.id,
    event_type: "submitted",
    to_status: "new",
    actor_name: session.userName,
    detail: detail || `Submitted by ${session.userName} (${session.name})`,
  });
  // ShopMonkey ticket first so the push can carry the RO number.
  const sm = await createShopMonkeyTicket(quote.id);
  await notifyWga(
    sm.ok && sm.number ? `New ${session.brand} order · RO ${sm.number}` : `New ${session.brand} order`,
    `${session.name}: ${quote.vehicle_year} ${quote.vehicle_model} ${quote.vehicle_trim} — ${lines.map((l) => l.name).join(", ")} · $${costTotal.toLocaleString("en-US")}${needDate ? ` · needed by ${needDate}${urgency === "urgent" ? " ⚠️" : ""}` : ""}`,
    { quote_id: quote.id, quote_number: quote.quote_number, sm_order_number: sm.number ?? null, needed_by: needDate, urgency }
  );
  return { sm_order_number: sm.number ?? null };
}
