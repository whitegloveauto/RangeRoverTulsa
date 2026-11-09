import { supabaseAdmin } from "@/lib/supabase";
import { kvGet, kvSet } from "@/lib/kv";

// How each dealership pays White Glove Auto. Statements follow it:
//   receipt  — due on receipt; monthly statement of what was completed
//   weekly   — work invoiced in a week (Mon–Sun) is paid on `pay_day` the following week
//   biweekly — every other `pay_day`, lined up with `anchor` (a real pay date); covers the two
//              Mon–Sun weeks before the pay date's week
//   net      — monthly statement, due `net_days` after month end (Net 15 / 30 / …)
// Stored per dealership in dealer_program_settings (billing:<id>); dealer_dealerships.billing_terms
// is kept in step as a plain day count for anything older that reads it.

export type BillingCycle = "receipt" | "weekly" | "biweekly" | "net";
export interface BillingTerms {
  cycle: BillingCycle;
  net_days: number;
  pay_day: number; // 0 = Sunday … 6 = Saturday
  anchor?: string; // YYYY-MM-DD, a known pay date (biweekly)
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const key = (id: string) => `billing:${id}`;

export async function getBillingTerms(dealershipId: string, fallbackNet?: number | null): Promise<BillingTerms> {
  let net = fallbackNet;
  if (net === undefined) {
    const { data } = await supabaseAdmin.from("dealer_dealerships").select("billing_terms").eq("id", dealershipId).maybeSingle();
    net = data?.billing_terms;
  }
  const saved = await kvGet<Partial<BillingTerms> | null>(key(dealershipId), null);
  return normalizeTerms({ cycle: "net", net_days: Number(net) || 30, pay_day: 5, ...(saved || {}) });
}

export function normalizeTerms(t: Partial<BillingTerms>): BillingTerms {
  const cycle: BillingCycle = (["receipt", "weekly", "biweekly", "net"] as const).includes(t.cycle as any) ? (t.cycle as BillingCycle) : "net";
  const net_days = Math.max(0, Math.min(180, Math.round(Number(t.net_days ?? 30)) || 0));
  const pay_day = Math.max(0, Math.min(6, Math.round(Number(t.pay_day ?? 5)) || 0));
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(String(t.anchor || "")) ? String(t.anchor) : undefined;
  return { cycle, net_days: cycle === "net" ? net_days || 30 : net_days, pay_day, ...(cycle === "biweekly" ? { anchor } : {}) };
}

export async function saveBillingTerms(dealershipId: string, t: Partial<BillingTerms>): Promise<BillingTerms> {
  const terms = normalizeTerms(t);
  if (terms.cycle === "biweekly" && !terms.anchor) {
    // default the cycle to the next upcoming pay day
    terms.anchor = nextWeekday(todayLocal(), terms.pay_day);
  }
  await kvSet(key(dealershipId), terms);
  const days = terms.cycle === "net" ? terms.net_days : terms.cycle === "weekly" ? 7 : terms.cycle === "biweekly" ? 14 : 0;
  await supabaseAdmin.from("dealer_dealerships").update({ billing_terms: days }).eq("id", dealershipId);
  return terms;
}

export function termsLabel(t: BillingTerms): string {
  if (t.cycle === "receipt") return "Due on receipt";
  if (t.cycle === "weekly") return `Weekly · paid ${WEEKDAYS[t.pay_day]}s`;
  if (t.cycle === "biweekly") return `Every 2 weeks · ${WEEKDAYS[t.pay_day]}s`;
  return `Net ${t.net_days}`;
}

// ---- local (Tulsa) date helpers; all dates are YYYY-MM-DD strings in America/Chicago
const TZ = "America/Chicago";
export const localDate = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
export const todayLocal = () => localDate(new Date());
const toUtcNoon = (ymd: string) => new Date(ymd + "T12:00:00Z");
export const addDays = (ymd: string, n: number) => {
  const d = toUtcNoon(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd: string) => toUtcNoon(ymd).getUTCDay();
export function nextWeekday(fromYmd: string, wd: number) {
  return addDays(fromYmd, (wd - weekday(fromYmd) + 7) % 7);
}
function tzOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - utcMs;
}
// UTC instant of local midnight at the start of `ymd`
export function localMidnightUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - tzOffsetMs(guess - tzOffsetMs(guess));
}
const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) => toUtcNoon(ymd).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
const short = (ymd: string) => fmt(ymd, { month: "short", day: "numeric" });

export interface BillingPeriod {
  key: string; // YYYY-MM (monthly) or YYYY-MM-DD (pay date)
  label: string;
  from: string; // first day included (local)
  to: string; // last day included (local)
  statementDate: string;
  dueDate: string | null; // null = due on receipt
  dueLabel: string;
}

function monthPeriod(t: BillingTerms, ym: string): BillingPeriod {
  const from = `${ym}-01`;
  const [y, m] = ym.split("-").map(Number);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const label = fmt(from, { month: "long", year: "numeric" });
  if (t.cycle === "receipt") return { key: ym, label, from, to, statementDate: to, dueDate: null, dueLabel: "Due on receipt" };
  const due = addDays(to, t.net_days);
  return { key: ym, label, from, to, statementDate: to, dueDate: due, dueLabel: `Net ${t.net_days} · due ${fmt(due, { weekday: "short", month: "short", day: "numeric" })}` };
}

// Monday of the week (Mon–Sun) that contains ymd
export const mondayOf = (ymd: string) => addDays(ymd, -((weekday(ymd) + 6) % 7));

function payPeriod(t: BillingTerms, payDate: string): BillingPeriod {
  const len = t.cycle === "weekly" ? 7 : 14;
  const weekStart = mondayOf(payDate);
  const from = addDays(weekStart, -len);
  const to = addDays(weekStart, -1);
  return {
    key: payDate,
    label: `${short(from)} – ${short(to)}`,
    from,
    to,
    statementDate: to,
    dueDate: payDate,
    dueLabel: `Paid ${fmt(payDate, { weekday: "short", month: "short", day: "numeric" })}`,
  };
}

// The pay date that covers work invoiced on `ymd` (weekly / every-2-weeks schedules).
function payDateFor(t: BillingTerms, ymd: string): string {
  let pay = nextWeekday(addDays(mondayOf(ymd), 7), t.pay_day); // the following week's pay day
  if (t.cycle === "biweekly" && t.anchor) {
    const diff = Math.round((toUtcNoon(pay).getTime() - toUtcNoon(t.anchor).getTime()) / 86400000);
    if (((diff % 14) + 14) % 14) pay = addDays(pay, 7); // not a pay week → the one after
  }
  return pay;
}

// When White Glove Auto should expect payment for work invoiced on `invoicedYmd`.
export function expectedPayment(t: BillingTerms, invoicedYmd: string): { date: string | null; label: string } {
  if (t.cycle === "receipt") return { date: invoicedYmd, label: "Due on receipt" };
  if (t.cycle === "weekly" || t.cycle === "biweekly") {
    const d = payDateFor(t, invoicedYmd);
    return { date: d, label: `Expected ${fmt(d, { weekday: "short", month: "short", day: "numeric" })}` };
  }
  const due = monthPeriod(t, invoicedYmd.slice(0, 7)).dueDate!;
  return { date: due, label: `Net ${t.net_days} · due ${fmt(due, { weekday: "short", month: "short", day: "numeric" })}` };
}

// Recent statement periods, newest first: this week's (still open), then the ones before it.
export function recentPeriods(t: BillingTerms, count = 12): BillingPeriod[] {
  const today = todayLocal();
  if (t.cycle === "weekly" || t.cycle === "biweekly") {
    const pay = payDateFor(t, today);
    const step = t.cycle === "weekly" ? 7 : 14;
    return Array.from({ length: count }, (_, i) => payPeriod(t, addDays(pay, -step * i)));
  }
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    return monthPeriod(t, d.toISOString().slice(0, 7));
  });
}

export function periodFor(t: BillingTerms, key: string | null): BillingPeriod {
  const list = recentPeriods(t, 3);
  if (t.cycle === "weekly" || t.cycle === "biweekly") {
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) return payPeriod(t, key);
    // default: the oldest period that hasn't been paid yet (last week's work until its pay day passes)
    const today = todayLocal();
    const unpaid = list.filter((p) => (p.dueDate || "") >= today);
    return unpaid[unpaid.length - 1] || list[0];
  }
  if (key && /^\d{4}-\d{2}$/.test(key)) return monthPeriod(t, key);
  // early in the month you're billing last month; later, this month
  const today = todayLocal();
  return Number(today.slice(8, 10)) <= 7 ? recentPeriods(t, 2)[1] : list[0];
}
