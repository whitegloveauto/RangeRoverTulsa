import { supabaseAdmin } from "@/lib/supabase";
import { emailOrderEvent } from "@/lib/dealerEmail";
import { setShopMonkeyUnit } from "@/lib/shopmonkey";

// ShopMonkey → portal status sync. Reads each open order's RO through the existing
// dealer-order-sm edge function (read-only "raw" GET probe — the ShopMonkey key never
// leaves Supabase) and moves the portal status forward when the shop's workflow does.
// Never moves an order backwards and never touches complete (paid) / cancelled orders.
// Pipeline: … in progress → invoiced (work done / RO invoiced) → complete (paid).
// Also makes sure the dealer order number is in the ShopMonkey vehicle's Unit field.

const RANK: Record<string, number> = { new: 0, in_shopmonkey: 1, scheduled: 2, in_progress: 3, invoiced: 4, complete: 5 };
const OPEN = ["new", "in_shopmonkey", "scheduled", "in_progress", "invoiced"];
const BATCH = 12; // per run, least-recently-synced first (keeps a run well under the ~10s function limit)
const CONCURRENCY = 4;

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

// What the RO says, reduced to a portal status (or null = no opinion).
export function mapShopMonkey(o: any, wfName: string): { status: string | null; why: string } {
  const n = (wfName || "").toLowerCase();
  const smStatus = String(o?.status || "");
  if (o?.deleted || o?.archived) return { status: null, why: "RO archived in ShopMonkey" };
  if (o?.paid === true || /\bpaid\b/.test(n)) return { status: "complete", why: o?.paid === true ? "RO paid" : `workflow “${wfName}”` };
  if (/\b(complete[d]?|done|ready|pick ?up|picked up|delivered|invoiced?|closed)\b/.test(n)) return { status: "invoiced", why: `workflow “${wfName}”` };
  if (smStatus === "Invoice" || o?.invoiced === true || o?.completedDate || o?.completedAt) return { status: "invoiced", why: `RO ${smStatus === "Invoice" || o?.invoiced ? "invoiced" : "completed"}` };
  if (/\b(in progress|progress|in[ -]shop|working|wip|install(ing)?|started|in bay|qc|quality( check)?)\b/.test(n)) return { status: "in_progress", why: `workflow “${wfName}”` };
  if (/\b(scheduled?|appointment|appt|booked|confirmed)\b/.test(n)) return { status: "scheduled", why: `workflow “${wfName}”` };
  return { status: null, why: wfName ? `workflow “${wfName}” (no change)` : "no workflow status" };
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
  let unitBudget = 3;
  const lines: SyncLine[] = [];
  let sampleKeys: string[] | undefined;
  const queue = [...(orders || [])];

  async function worker() {
    while (queue.length) {
      const o = queue.shift()!;
      const line: SyncLine = { quote_number: o.quote_number, ro: o.sm_order_number, workflow: "", sm_status: "", from: o.status, to: null, note: "" };
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
        const m = mapShopMonkey(ro, wfName);
        line.note = m.why;
        const forward = m.status && (RANK[m.status] ?? -1) > (RANK[o.status] ?? -1);
        if (forward) line.to = m.status;
        if (!opts.dry) {
          const now = new Date().toISOString();
          const patch: any = { sm_synced_at: now, sm_sync_error: null };
          if (forward) Object.assign(patch, { status: m.status, status_updated_at: now, updated_at: now });
          await supabaseAdmin.from("dealer_quotes").update(patch).eq("id", o.id);
          if (forward) {
            await supabaseAdmin.from("dealer_order_events").insert({
              quote_id: o.id,
              event_type: "status_change",
              from_status: o.status,
              to_status: m.status,
              actor_name: "ShopMonkey sync",
              detail: `ShopMonkey ${m.why}${o.sm_order_number ? ` · RO ${o.sm_order_number}` : ""}`,
            });
            // invoiced = the dealer's car is done; paid after invoiced isn't news to them
            const dealerSt = m.status === "invoiced" ? "complete" : m.status === "complete" && o.status === "invoiced" ? null : m.status;
            if (dealerSt === "scheduled" || dealerSt === "in_progress" || dealerSt === "complete") await emailOrderEvent(o.id, { kind: "status", status: dealerSt });
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
