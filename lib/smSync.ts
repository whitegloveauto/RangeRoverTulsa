import { supabaseAdmin } from "@/lib/supabase";
import { emailOrderEvent } from "@/lib/dealerEmail";
import { setShopMonkeyUnit } from "@/lib/shopmonkey";
import { localDate, todayLocal } from "@/lib/billing";
import { AWAITING_PAYMENT, normalizeStatus } from "@/lib/orderStatus";

// ShopMonkey → portal status sync. Reads each open order's RO through the existing
// dealer-order-sm edge function (read-only "raw" GET probe — the ShopMonkey key never
// leaves Supabase) and moves the portal status forward when the shop does.
//
// What ShopMonkey moves on its own (forward only; complete / cancelled orders are never touched):
//   • The RO is on the ShopMonkey calendar (an appointment linked to it), or its board column is
//     Scheduled / Dispatched                                  → scheduled
//     The scheduled date is always the FIRST day the RO is on the calendar — the day work starts.
//     It follows the calendar if that appointment is moved; nobody types it in.
//   • The board column is In Progress or anything after it (Quality Check, Invoices, Completed),
//     or the RO has been invoiced                             → in progress
//   • The RO is paid in full AND the order is in awaiting payment → complete
//
// What it never does: move an order INTO awaiting payment. That step means "the work is done" and
// is made by hand (WGA orders page / WGA Command app). ShopMonkey can't tell: the dealership is
// usually invoiced while the car is still in the shop, and an invoiced RO sits in the Invoices
// column either way. A paid RO whose order isn't in awaiting payment yet completes as soon as
// someone moves it there.
//
// Also makes sure the dealer order number is in the ShopMonkey vehicle's Unit field.

const RANK: Record<string, number> = { new: 0, in_shopmonkey: 1, scheduled: 2, in_progress: 3, awaiting_payment: 4, complete: 5 };
const OPEN = ["new", "in_shopmonkey", "scheduled", "in_progress", AWAITING_PAYMENT, "invoiced"]; // "invoiced" = old name of awaiting_payment
const BATCH = 12; // per run, least-recently-synced first
const CONCURRENCY = 4;
const RUN_BUDGET_MS = 7000; // stop picking up orders after this; the rest go first next run (~10s function limit)

async function edgeGet(token: string, path: string): Promise<{ ok: boolean; status: number; data: any }> {
  const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/dealer-order-sm`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-token": token },
    body: JSON.stringify({ probe: "raw", method: "GET", path }),
    signal: AbortSignal.timeout(12000),
  });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.ok, status: j.status ?? r.status, data: j.data };
}

let wfCache: { at: number; byId: Record<string, string> } | null = null;
async function workflowNames(token: string): Promise<Record<string, string>> {
  if (wfCache && Date.now() - wfCache.at < 10 * 60 * 1000) return wfCache.byId;
  const byId: Record<string, string> = {};
  try {
    const r = await edgeGet(token, "/workflow_status");
    const list = r.data?.data ?? r.data;
    if (Array.isArray(list)) for (const w of list) if (w?.id) byId[String(w.id)] = String(w.name ?? w.label ?? "");
  } catch {}
  wfCache = { at: Date.now(), byId };
  return byId;
}

// ---- reading the RO ---------------------------------------------------------------------------
// Board column names are matched loosely so renaming a column in ShopMonkey doesn't break the sync.
// White Glove's board today: Leads / Follow Ups · Hot Leads · No Deal · Deal / Not Scheduled ·
// Design In Process · Scheduled · Dispatched · In Progress · Quality Check · Invoices ·
// Quality Check Call · Completed.
const COL_NOT_SCHEDULED = /\b(not|un)[ -]?scheduled\b/; // "Deal / Not Scheduled" is not a schedule
const COL_SCHEDULED = /\b(scheduled?|appointment|appt|booked|confirmed|dispatch(ed)?)\b/;
const COL_IN_PROGRESS = /\b(in progress|progress|in[ -]shop|working|wip|install(ing)?|started|in bay|qc|quality( check)?)\b/;
const COL_AFTER_WORK = /\b(complete[d]?|done|ready|pick ?up|picked up|delivered|invoice[ds]?|closed)\b/;

export interface RoSignals {
  deleted: boolean;
  archived: boolean;
  paid: boolean; // paid in full
  invoiced: boolean; // the RO has been turned into an invoice
  started: boolean; // work is under way (or further along)
  startedWhy: string;
  scheduledColumn: boolean; // sitting in a "scheduled" board column
  hasAppointmentDates: boolean | null; // null = ShopMonkey didn't say
}

export function readShopMonkey(o: any, wfName: string): RoSignals {
  const n = (wfName || "").toLowerCase();
  const total = Number(o?.totalCostCents);
  const paidCents = Number(o?.paidCostCents);
  const emptyTicket = Number.isFinite(total) && total <= 0; // a $0 ticket is never "paid"
  const paid = !emptyTicket && (o?.paid === true || (Number.isFinite(total) && Number.isFinite(paidCents) && paidCents >= total));
  const invoiced = String(o?.status || "") === "Invoice" || o?.invoiced === true;
  const colStarted = COL_IN_PROGRESS.test(n) || COL_AFTER_WORK.test(n);
  return {
    deleted: !!o?.deleted,
    archived: !!o?.archived,
    paid,
    invoiced,
    started: colStarted || invoiced || !!o?.completedDate || !!o?.completedAt,
    startedWhy: colStarted ? `workflow “${wfName}”` : invoiced ? "RO invoiced" : "RO completed",
    scheduledColumn: !COL_NOT_SCHEDULED.test(n) && COL_SCHEDULED.test(n),
    hasAppointmentDates: Array.isArray(o?.appointmentDates) ? o.appointmentDates.length > 0 : null,
  };
}

// The day work starts: the first day the RO is on the ShopMonkey calendar (live appointments
// only), as a Tulsa date. A multi-day job keeps its first day.
export function installDate(startDates: string[]): string | null {
  const days = startDates.map((d) => localDate(d)).sort();
  return days[0] || null;
}

const niceDay = (ymd: string) => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

// Where the order should be, given where it is and what ShopMonkey says (null = leave it alone).
export function decide(current: string, sm: RoSignals, wfName: string, apptDate: string | null): { status: string | null; why: string } {
  const cur = normalizeStatus(current);
  if (sm.deleted) return { status: null, why: "RO deleted in ShopMonkey" };
  if (cur === AWAITING_PAYMENT) return sm.paid ? { status: "complete", why: "RO paid" } : { status: null, why: "waiting for payment in ShopMonkey" };
  if (sm.archived) return { status: null, why: "RO archived in ShopMonkey" };
  const rank = RANK[cur] ?? 99;
  if (sm.started && rank < RANK.in_progress) return { status: "in_progress", why: sm.startedWhy };
  if (rank < RANK.scheduled) {
    if (apptDate) return { status: "scheduled", why: `calendar: ${niceDay(apptDate)}` };
    if (sm.scheduledColumn) return { status: "scheduled", why: `workflow “${wfName}”` };
  }
  if (sm.paid) return { status: null, why: "RO paid — completes once it's moved to awaiting payment" };
  return { status: null, why: wfName ? `workflow “${wfName}” (no change)` : "no workflow status" };
}

// Live calendar appointments linked to an RO (cancelled / deleted ones don't count).
async function appointmentStarts(token: string, orderId: string): Promise<{ ok: boolean; starts: string[] }> {
  const r = await edgeGet(token, `/appointment?limit=100&where=${encodeURIComponent(JSON.stringify({ orderId }))}`);
  const list = r.data?.data ?? r.data;
  if (!r.ok || !Array.isArray(list)) return { ok: false, starts: [] };
  const starts = list
    .filter((a: any) => a && a.deleted !== true && a.startDate && (a.orderId == null || a.orderId === orderId) && !/cancel/i.test(String(a.confirmationStatus ?? "")))
    .map((a: any) => String(a.startDate));
  return { ok: true, starts };
}

export interface SyncLine {
  quote_number: string;
  ro: string | null;
  workflow: string;
  sm_status: string;
  from: string;
  to: string | null;
  note: string;
}

export async function runShopMonkeySync(opts: { dry?: boolean; quoteIds?: string[] } = {}) {
  const { data: tok } = await supabaseAdmin.from("dealer_program_settings").select("value").eq("key", "sm_internal_token").maybeSingle();
  const token = tok?.value ? String(tok.value) : "";
  if (!token || !process.env.SUPABASE_URL) return { ok: false, error: "ShopMonkey link isn't configured (sm_internal_token).", lines: [] as SyncLine[] };

  let q = supabaseAdmin
    .from("dealer_quotes")
    .select("id, quote_number, status, sm_order_id, sm_order_number, scheduled_date")
    .not("sm_order_id", "is", null)
    .in("status", OPEN)
    .order("sm_synced_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (opts.quoteIds?.length) q = q.in("id", opts.quoteIds);
  const { data: orders, error } = await q;
  if (error) return { ok: false, error: "Could not load orders.", lines: [] as SyncLine[] };

  const wf = await workflowNames(token);
  const started = Date.now();
  const today = todayLocal();
  let unitBudget = 3;
  const lines: SyncLine[] = [];
  let sampleKeys: string[] | undefined;
  const queue = [...(orders || [])];

  async function worker() {
    while (queue.length && Date.now() - started < RUN_BUDGET_MS) {
      const o = queue.shift()!;
      const cur = normalizeStatus(o.status);
      const line: SyncLine = { quote_number: o.quote_number, ro: o.sm_order_number, workflow: "", sm_status: "", from: cur, to: null, note: "" };
      try {
        const r = await edgeGet(token, `/order/${encodeURIComponent(o.sm_order_id)}`);
        const ro = r.data?.data ?? r.data;
        if (!r.ok || !ro || typeof ro !== "object") {
          line.note = `ShopMonkey ${r.status}`;
          lines.push(line);
          continue;
        }
        if (!sampleKeys) sampleKeys = Object.keys(ro).sort();
        const wfId = ro.workflowStatusId ?? ro.workflowStatus?.id ?? null;
        const wfName = String(ro.workflowStatus?.name ?? (wfId ? wf[String(wfId)] : "") ?? "");
        line.workflow = wfName;
        line.sm_status = String(ro.status || "");
        const sm = readShopMonkey(ro, wfName);

        // The calendar decides "scheduled" until the work starts, and gives the scheduled date (also
        // filled in once for an order that reached in progress without one). Skip the lookup when
        // ShopMonkey says the RO has no appointments; if it fails, leave things alone until next run.
        let apptDate: string | null = null;
        const rank = RANK[cur] ?? 99;
        const wantsCalendar = (!sm.started && rank <= RANK.scheduled) || (!o.scheduled_date && rank <= RANK.in_progress);
        if (wantsCalendar && !sm.deleted && !sm.archived && sm.hasAppointmentDates !== false) {
          const ap = await appointmentStarts(token, String(o.sm_order_id));
          if (ap.ok) apptDate = installDate(ap.starts);
          else line.note = "calendar lookup failed · ";
        }

        const m = decide(cur, sm, wfName, apptDate);
        line.note += m.why;
        if (m.status) line.to = m.status;
        const end = m.status ?? cur; // where the order is after this run
        // Scheduled: the date follows the calendar. In progress: only fill in a missing date.
        const newDate = apptDate && apptDate !== o.scheduled_date && (end === "scheduled" || (end === "in_progress" && !o.scheduled_date)) ? apptDate : null;
        if (newDate && !m.status) line.note += ` · scheduled date ${o.scheduled_date ? `${o.scheduled_date} → ` : ""}${newDate}`;

        if (!opts.dry) {
          const now = new Date().toISOString();
          const patch: any = { sm_synced_at: now, sm_sync_error: null };
          if (m.status) Object.assign(patch, { status: m.status, status_updated_at: now, updated_at: now });
          if (newDate) Object.assign(patch, { scheduled_date: newDate, updated_at: now });
          await supabaseAdmin.from("dealer_quotes").update(patch).eq("id", o.id);
          const roTag = o.sm_order_number ? ` · RO ${o.sm_order_number}` : "";
          if (m.status) {
            await supabaseAdmin.from("dealer_order_events").insert({
              quote_id: o.id,
              event_type: "status_change",
              from_status: cur,
              to_status: m.status,
              actor_name: "ShopMonkey sync",
              detail: `ShopMonkey ${m.why}${roTag}`,
            });
            // Scheduled / in the shop is news to the dealership (not a "scheduled" for a day that
            // has already gone by). Paid isn't: to them the order was complete the moment it went
            // to awaiting payment.
            const staleSchedule = m.status === "scheduled" && !!apptDate && apptDate < today;
            if ((m.status === "scheduled" && !staleSchedule) || m.status === "in_progress") await emailOrderEvent(o.id, { kind: "status", status: m.status });
          } else if (newDate) {
            await supabaseAdmin.from("dealer_order_events").insert({
              quote_id: o.id,
              event_type: "schedule",
              actor_name: "ShopMonkey sync",
              detail: `ShopMonkey calendar: scheduled date ${o.scheduled_date ? `moved from ${o.scheduled_date} to` : "set to"} ${newDate}${roTag}`,
            });
            // A scheduled order getting (or changing to) a day that is still ahead is worth an
            // email. Filling in a day that has already gone by isn't.
            if (end === "scheduled" && newDate >= today) await emailOrderEvent(o.id, { kind: "schedule" });
          }
        }
        // a few Unit fixes per run, early in the run, so the sync stays inside the function time limit
        if (!opts.dry && unitBudget > 0 && Date.now() - started < 4000) {
          unitBudget--;
          const u = await setShopMonkeyUnit(o.id);
          if (u.note === "already set" || u.note.startsWith("waiting") || u.note.startsWith("no ShopMonkey")) unitBudget++; // no ShopMonkey call made
          else line.note += ` · Unit: ${u.ok ? "set" : u.note}`;
        }
      } catch (e: any) {
        line.note = `error: ${String(e?.message || e).slice(0, 120)}`;
      }
      lines.push(line);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, worker));
  const changed = lines.filter((l) => l.to).length;
  return { ok: true, checked: lines.length, changed, workflowStatuses: Object.values(wf), sampleKeys, lines };
}
