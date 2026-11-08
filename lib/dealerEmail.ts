import { supabaseAdmin } from "@/lib/supabase";
import { kvGet, kvSet } from "@/lib/kv";
import { renderEmail, sendEmail, siteUrlFor } from "@/lib/email";

// Who at a dealership hears about what, by email.
//   per user: "mine" (default — orders and comebacks they placed), "all" (every order), "off"
//   extra:    addresses that get everything (e.g. a sales-manager distro list)
export type NotifyLevel = "mine" | "all" | "off";
export interface NotifyPrefs {
  users: Record<string, NotifyLevel>;
  extra: string[];
}

const prefsKey = (dealershipId: string) => `notify:${dealershipId}`;

export async function getNotifyPrefs(dealershipId: string): Promise<NotifyPrefs> {
  const p = await kvGet<Partial<NotifyPrefs>>(prefsKey(dealershipId), {});
  return { users: p.users || {}, extra: Array.isArray(p.extra) ? p.extra : [] };
}

export async function setNotifyPrefs(dealershipId: string, prefs: NotifyPrefs) {
  return kvSet(prefsKey(dealershipId), prefs);
}

async function recipients(dealershipId: string, ownerUserId: string | null): Promise<string[]> {
  const [prefs, { data: users }] = await Promise.all([
    getNotifyPrefs(dealershipId),
    supabaseAdmin.from("dealer_users").select("id, email, active").eq("dealership_id", dealershipId),
  ]);
  const out = new Set<string>(prefs.extra.map((e) => e.toLowerCase()));
  for (const u of users || []) {
    if (!u.active || !u.email) continue;
    const level = prefs.users[u.id] || "mine";
    if (level === "all" || (level === "mine" && ownerUserId && u.id === ownerUserId)) out.add(u.email.toLowerCase());
  }
  return Array.from(out);
}

const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "");

export const DEALER_STATUS_LABEL: Record<string, string> = {
  new: "Received",
  in_shopmonkey: "Received",
  scheduled: "Scheduled",
  in_progress: "In the shop",
  complete: "Complete",
  cancelled: "Cancelled",
};

const QUOTE_FIELDS =
  "id, quote_number, dealership_id, dealer_user_id, vehicle_year, vehicle_model, vehicle_trim, vehicle_vin, stock_number, customer_name, scheduled_date, needed_by, sm_order_number, status, line_items, dealer_dealerships(name, short_name)";

type OrderEvent =
  | { kind: "status"; status: string }
  | { kind: "schedule" }
  | { kind: "qc"; count: number }
  | { kind: "reply"; body: string; author: string };

// Email the dealership about something that happened on one of its orders. Never throws.
export async function emailOrderEvent(quoteId: string, ev: OrderEvent) {
  try {
    const { data: q } = await supabaseAdmin.from("dealer_quotes").select(QUOTE_FIELDS).eq("id", quoteId).maybeSingle();
    if (!q) return;
    const to = await recipients(q.dealership_id, q.dealer_user_id);
    if (!to.length) return;
    const base = await siteUrlFor(q.dealership_id);
    const d: any = (q as any).dealer_dealerships || {};
    const vehicle = `${q.vehicle_year} ${q.vehicle_model}`;
    const tag = q.stock_number ? ` · Stock ${q.stock_number}` : q.customer_name ? ` · ${q.customer_name}` : "";
    const services = (Array.isArray(q.line_items) ? q.line_items : []).map((l: any) => l.name).join(", ");
    const rows: [string, string][] = [
      ["Vehicle", `${q.vehicle_year} ${q.vehicle_model} ${q.vehicle_trim}`],
      ["Stock #", q.stock_number || ""],
      ["VIN", q.vehicle_vin || ""],
      ["Customer", q.customer_name || ""],
      ["Services", services],
      ["Order", `${q.quote_number}${q.sm_order_number ? ` · RO ${q.sm_order_number}` : ""}`],
    ];

    let subject = "";
    let heading = "";
    let intro = "";
    let quote: string | undefined;
    if (ev.kind === "status" || ev.kind === "schedule") {
      const status = ev.kind === "status" ? ev.status : q.status;
      const label = DEALER_STATUS_LABEL[status] || status;
      if (status === "scheduled" || ev.kind === "schedule") {
        const when = fmtDate(q.scheduled_date);
        subject = `${vehicle}${tag} — scheduled${when ? ` for ${when}` : ""}`;
        heading = when ? `Scheduled for ${when}.` : "Your order is scheduled.";
        intro = ev.kind === "schedule" ? "The install date on this order changed." : "White Glove Auto has put this vehicle on the schedule.";
        rows.unshift(["Install date", when || "To be confirmed"]);
        if (q.needed_by) rows.splice(1, 0, ["You need it back by", fmtDate(q.needed_by)]);
      } else if (status === "in_progress") {
        subject = `${vehicle}${tag} — in the shop`;
        heading = "Work has started.";
        intro = "The vehicle is in the White Glove Auto shop and the install is under way.";
      } else if (status === "complete") {
        subject = `${vehicle}${tag} — complete`;
        heading = "Done — ready for pickup.";
        intro = "The install is finished and has passed quality check. QC photos, if taken, are on the order page.";
      } else if (status === "cancelled") {
        subject = `${vehicle}${tag} — cancelled`;
        heading = "This order was cancelled.";
        intro = "If that's a surprise, reply to this email or call the shop.";
      } else {
        subject = `${vehicle}${tag} — ${label.toLowerCase()}`;
        heading = `Order status: ${label}.`;
      }
    } else if (ev.kind === "qc") {
      subject = `QC photos ready · ${vehicle}${tag}`;
      heading = `${ev.count} quality-check photo${ev.count === 1 ? "" : "s"} added.`;
      intro = "Open the order to see them full size or share them with your customer.";
    } else if (ev.kind === "reply") {
      subject = `White Glove Auto replied · ${vehicle}${tag}`;
      heading = `${ev.author.split(" ")[0]} at White Glove Auto replied.`;
      quote = ev.body;
    }

    const { html, text } = renderEmail({
      base,
      partner: d.short_name || d.name,
      heading,
      intro,
      quote,
      rows,
      cta: { href: `${base}/portal/quote/${q.id}`, label: "Open the order" },
      footer: "You get this because of your email settings in the dealer portal. Your dealership admin can change them under Settings → Team logins.",
    });
    await sendEmail({ to, subject, html, text });
  } catch (e: any) {
    console.error("emailOrderEvent", e?.message || e);
  }
}

const CB_LABEL: Record<string, string> = { open: "Received", scheduled: "Scheduled", resolved: "Resolved", declined: "Declined" };

// Email the dealership about an update on a comeback / warranty claim. Never throws.
export async function emailComebackEvent(comebackId: string, change: { status?: string; scheduled?: boolean; note?: string }) {
  try {
    const { data: c } = await supabaseAdmin
      .from("dealer_comebacks")
      .select("id, comeback_number, dealership_id, created_by_user_id, customer_name, vehicle, vin, category, description, status, scheduled_date, wga_notes, dealer_dealerships(name, short_name)")
      .eq("id", comebackId)
      .maybeSingle();
    if (!c) return;
    const to = await recipients(c.dealership_id, c.created_by_user_id);
    if (!to.length) return;
    const base = await siteUrlFor(c.dealership_id);
    const d: any = (c as any).dealer_dealerships || {};
    const what = c.vehicle || c.customer_name || c.vin || "your comeback";
    const status = change.status || c.status;
    const when = fmtDate(c.scheduled_date);
    const heading =
      change.status === "scheduled" || (change.scheduled && when)
        ? `Comeback scheduled${when ? ` for ${when}` : ""}.`
        : change.status === "resolved"
        ? "Comeback resolved."
        : change.status === "declined"
        ? "Comeback declined."
        : "Update on your comeback.";
    const { html, text } = renderEmail({
      base,
      partner: d.short_name || d.name,
      heading,
      quote: change.note || undefined,
      rows: [
        ["Comeback", c.comeback_number || ""],
        ["Status", CB_LABEL[status] || status],
        ["Return date", when],
        ["Vehicle", c.vehicle || ""],
        ["Customer", c.customer_name || ""],
        ["Issue", c.description || ""],
      ],
      cta: { href: `${base}/portal/comebacks`, label: "View comebacks" },
      footer: "You get this because of your email settings in the dealer portal. Your dealership admin can change them under Settings → Team logins.",
    });
    await sendEmail({ to, subject: `Comeback ${c.comeback_number || ""} · ${what} — ${(CB_LABEL[status] || status).toLowerCase()}`, html, text });
  } catch (e: any) {
    console.error("emailComebackEvent", e?.message || e);
  }
}
