"use client";

// Dealer-facing status timeline built from dealer_order_events + the order itself.
const STATUS_LABEL: Record<string, string> = { new: "Received", in_shopmonkey: "Ticket opened at White Glove Auto", scheduled: "Scheduled", in_progress: "In the shop", complete: "Complete — ready for pickup", cancelled: "Cancelled" };
const STEPS = ["new", "in_shopmonkey", "scheduled", "in_progress", "complete"];

export default function OrderTimeline({ quote, events }: { quote: any; events: any[] }) {
  const when = (s: string) => new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const rows = (events || [])
    .filter((e) => ["submitted", "status_change", "shopmonkey_created", "qc_photos", "request", "comeback"].includes(e.event_type))
    .map((e) => {
      let text = "";
      if (e.event_type === "submitted") text = `Order received`;
      else if (e.event_type === "shopmonkey_created") text = `Ticket opened at White Glove Auto${quote.sm_order_number ? ` · RO ${quote.sm_order_number}` : ""}`;
      else if (e.event_type === "status_change") text = STATUS_LABEL[e.to_status] || `Status: ${e.to_status}`;
      else if (e.event_type === "qc_photos") text = "Quality-check photos added";
      else if (e.event_type === "request") text = `Request sent${e.actor_name ? ` by ${e.actor_name}` : ""}`;
      else if (e.event_type === "comeback") text = e.detail || "Comeback filed";
      return { text, at: e.created_at };
    });
  const idx = STEPS.indexOf(quote.status);
  return (
    <div className="timeline">
      <div className="tl-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={"tl-step " + (i < idx ? "done" : i === idx ? "now" : "")}>
            <span className="dot" />
            <span className="lbl">{STATUS_LABEL[s].split(" — ")[0].replace("Ticket opened at White Glove Auto", "Ticket opened")}</span>
          </div>
        ))}
      </div>
      {quote.status === "cancelled" ? <div className="notice warn" style={{ marginTop: 12 }}>This order was cancelled. Contact White Glove Auto if that&apos;s unexpected.</div> : null}
      {quote.scheduled_date ? <div className="tl-sched">Scheduled at White Glove Auto for <b>{new Date(quote.scheduled_date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</b>{quote.needed_by ? <> · you asked for it back by <b>{new Date(quote.needed_by + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b></> : null}</div> : null}
      <ul className="tl-log">
        {rows.length === 0 ? <li><span>No activity yet.</span></li> : null}
        {rows.map((r, i) => (
          <li key={i}><span>{r.text}</span><time>{when(r.at)}</time></li>
        ))}
      </ul>
    </div>
  );
}
