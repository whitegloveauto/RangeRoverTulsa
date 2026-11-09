import { supabaseAdmin } from "@/lib/supabase";

// Monthly statement for a dealership: every order completed in the month (Tulsa time),
// billed at WGA cost, with the dealership's net terms. Completion date = the most recent
// "→ complete" event on the order (falls back to when its status last changed).

const TZ = "America/Chicago";

function tzOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
  return asUtc - utcMs;
}
// UTC instant of local midnight on the 1st of (y, m)
function monthStartUtc(y: number, m: number): number {
  const guess = Date.UTC(y, m - 1, 1);
  return guess - tzOffsetMs(guess - tzOffsetMs(guess));
}
export const localDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function parseMonth(v: string | null): { y: number; m: number; key: string } {
  const now = localDate(new Date().toISOString());
  const mm = /^(\d{4})-(\d{2})$/.exec(v || "") || /^(\d{4})-(\d{2})/.exec(now)!;
  const y = Number(mm[1]);
  const m = Math.min(12, Math.max(1, Number(mm[2])));
  return { y, m, key: `${y}-${String(m).padStart(2, "0")}` };
}

export const monthLabel = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

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

export async function buildStatement(dealershipId: string, monthKey: string) {
  const { y, m, key } = parseMonth(monthKey);
  const start = monthStartUtc(y, m);
  const end = m === 12 ? monthStartUtc(y + 1, 1) : monthStartUtc(y, m + 1);

  const { data: d } = await supabaseAdmin.from("dealer_dealerships").select("id, name, short_name, slug, location, billing_terms").eq("id", dealershipId).maybeSingle();
  if (!d) return null;

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

  const terms = Number(d.billing_terms) || 30;
  const lastDay = new Date(Date.UTC(y, m, 0)); // last day of month
  const due = new Date(lastDay.getTime() + terms * 86400000);
  return {
    dealership: { id: d.id, name: d.name, short_name: d.short_name || d.name, slug: d.slug, location: d.location },
    month: key,
    label: monthLabel(key),
    terms,
    statementDate: lastDay.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
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
  const foot = [["", "", "", "", "", "", `TOTAL (${st.count} orders) · Net ${st.terms} · due ${st.dueDate}`, st.total.toFixed(2), ...(includeRetail ? [st.retailTotal.toFixed(2)] : [])]];
  return [head, ...rows, ...foot].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(st: Statement, includeRetail: boolean) {
  return new Response(statementCsv(st, includeRetail), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="WGA-statement-${st.dealership.slug}-${st.month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
