import { supabaseAdmin } from "@/lib/supabase";

import { addDays, getBillingTerms, localDate, localMidnightUtc, periodFor, recentPeriods, termsLabel } from "@/lib/billing";
export { localDate } from "@/lib/billing";

// Billing statement for a dealership: every order completed in the period (Tulsa time), billed
// at WGA cost. The period and due date follow the dealership's payment schedule (weekly on a pay
// day, every 2 weeks, monthly on receipt, or monthly Net N). Completion date = the most recent
// "→ complete" event on the order (falls back to when its status last changed).

export interface StatementLine {
  id: string;
  completed: string; // YYYY-MM-DD (Tulsa)
  quote_number: string;
  ro: string;
  vin: string;
  vehicle: string;
  services: string;
  placed_by: string;
  amount: number; // WGA bills the dealership
  retail: number; // dealership's customer price
}

export async function buildStatement(dealershipId: string, periodKey: string | null) {
  const { data: d } = await supabaseAdmin.from("dealer_dealerships").select("id, name, short_name, slug, location, billing_terms").eq("id", dealershipId).maybeSingle();
  if (!d) return null;
  const terms = await getBillingTerms(dealershipId, d.billing_terms);
  const period = periodFor(terms, periodKey);
  const start = localMidnightUtc(period.from);
  const end = localMidnightUtc(addDays(period.to, 1));

  // Candidates: completed orders whose status changed on/after the month start (completion can't be later than that).
  const { data: qs } = await supabaseAdmin
    .from("dealer_quotes")
    .select("id, quote_number, sm_order_number, vehicle_vin, vehicle_year, vehicle_model, vehicle_trim, line_items, dealer_user_name, cost_total, retail_total, status_updated_at, submitted_at")
    .eq("dealership_id", dealershipId)
    .eq("status", "complete")
    .gte("status_updated_at", new Date(start - 86400000).toISOString())
    .order("status_updated_at", { ascending: true })
    .limit(1000);

  const ids = (qs || []).map((q) => q.id);
  const doneAt: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 150) {
    const { data: ev } = await supabaseAdmin.from("dealer_order_events").select("quote_id, created_at").in("quote_id", ids.slice(i, i + 150)).eq("to_status", "complete");
    for (const e of ev || []) if (!doneAt[e.quote_id] || e.created_at > doneAt[e.quote_id]) doneAt[e.quote_id] = e.created_at;
  }

  const lines: StatementLine[] = [];
  for (const q of qs || []) {
    const at = doneAt[q.id] || q.status_updated_at || q.submitted_at;
    if (!at) continue;
    const t = new Date(at).getTime();
    if (t < start || t >= end) continue;
    lines.push({
      id: q.id,
      completed: localDate(at),
      quote_number: q.quote_number || "",
      ro: q.sm_order_number || "",
      vin: q.vehicle_vin || "",
      vehicle: `${q.vehicle_year} ${q.vehicle_model} ${q.vehicle_trim}`,
      services: (Array.isArray(q.line_items) ? q.line_items : []).map((l: any) => l.name).join("; "),
      placed_by: q.dealer_user_name || "",
      amount: Number(q.cost_total || 0),
      retail: Number(q.retail_total || 0),
    });
  }
  lines.sort((a, b) => a.completed.localeCompare(b.completed) || a.quote_number.localeCompare(b.quote_number));

  return {
    dealership: { id: d.id, name: d.name, short_name: d.short_name || d.name, slug: d.slug, location: d.location },
    period: period.key,
    periods: recentPeriods(terms).map((p) => ({ key: p.key, label: p.label, dueLabel: p.dueLabel })),
    label: period.label,
    from: period.from,
    to: period.to,
    terms: termsLabel(terms),
    cycle: terms.cycle,
    statementDate: period.statementDate,
    dueDate: period.dueDate,
    dueLabel: period.dueLabel,
    count: lines.length,
    total: lines.reduce((s, l) => s + l.amount, 0),
    retailTotal: lines.reduce((s, l) => s + l.retail, 0),
    lines,
  };
}

export type Statement = NonNullable<Awaited<ReturnType<typeof buildStatement>>>;

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function statementCsv(st: Statement, includeRetail: boolean): string {
  const head = ["Completed", "Order #", "RO #", "VIN", "Vehicle", "Services", "Placed by", "Amount (WGA)", ...(includeRetail ? ["Your retail"] : [])];
  const rows = st.lines.map((l) => [l.completed, l.quote_number, l.ro, l.vin, l.vehicle, l.services, l.placed_by, l.amount.toFixed(2), ...(includeRetail ? [l.retail.toFixed(2)] : [])]);
  const foot = [["", "", "", "", "", "", `TOTAL (${st.count} orders) · ${st.terms} · ${st.dueLabel}`, st.total.toFixed(2), ...(includeRetail ? [st.retailTotal.toFixed(2)] : [])]];
  return [head, ...rows, ...foot].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(st: Statement, includeRetail: boolean) {
  return new Response(statementCsv(st, includeRetail), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="WGA-statement-${st.dealership.slug}-${st.period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
