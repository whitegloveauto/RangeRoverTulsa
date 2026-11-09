"use client";

import { useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import { useWgaSession } from "@/lib/useDealerSession";

const CATS: Record<string, string> = { ppf: "PPF", ceramic: "Ceramic", tint: "Tint", windshield: "Windshield", other: "Other" };
const STATUSES: [string, string][] = [["open", "Open"], ["scheduled", "Scheduled"], ["resolved", "Resolved"], ["declined", "Declined"]];

export default function WgaComebacksPage() {
  const { session, ready } = useWgaSession();
  const [filter, setFilter] = useState("open");
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  async function load(f = filter) {
    const r = await fetch("/api/wga/comebacks?status=" + f);
    if (r.ok) setRows((await r.json()).comebacks || []);
  }
  useEffect(() => {
    if (ready) load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filter]);
  async function patch(id: string, body: any) {
    setMsg("");
    const r = await fetch("/api/wga/comebacks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    if (!r.ok) setMsg((await r.json()).error || "Update failed");
    load();
  }
  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} />
      <main>
        <div className="stage" style={{ maxWidth: 1100 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">COMEBACKS &amp; WARRANTY</div>
            <div className="stage-title">Make it right.</div>
            <div className="stage-sub">Issues dealerships report on vehicles we&apos;ve already done. Each one is tied to the original order by VIN. Schedule it, note what you found, and close it out.</div>
          </div>
          <div className="tabs">
            {[...STATUSES, ["all", "All"]].map(([k, l]) => <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>)}
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}
          <div className="order-cards" style={{ display: "flex" }}>
            {rows.length === 0 ? <div className="card" style={{ textAlign: "center" }}>Nothing here.</div> : null}
            {rows.map((c) => (
              <div key={c.id} className="order-card open">
                <div className="oc-top">
                  <span className={"status-pill " + (c.status === "open" ? "new" : c.status === "scheduled" ? "scheduled" : c.status === "resolved" ? "complete" : "cancelled")}>{STATUSES.find((s) => s[0] === c.status)?.[1] || c.status}</span>
                  <span className="oc-num">{c.comeback_number} · {CATS[c.category] || c.category}</span>
                </div>
                <div className="oc-vehicle">{c.vehicle || "Vehicle"} {c.vin ? <span className="vin">VIN {c.vin}</span> : null}</div>
                <div className="oc-services">{c.description}</div>
                <div className="oc-meta">
                  <span>{c.dealer_dealerships?.short_name || c.dealer_dealerships?.name}</span>
                  <span>Filed {new Date(c.created_at).toLocaleDateString()} by {c.created_by_name}</span>
                  {c.dealer_quotes ? <span>Original {c.dealer_quotes.quote_number}{c.dealer_quotes.sm_order_number ? ` · RO ${c.dealer_quotes.sm_order_number}` : ""}{c.dealer_quotes.submitted_at ? ` · ${new Date(c.dealer_quotes.submitted_at).toLocaleDateString()}` : ""} · {(c.dealer_quotes.line_items || []).map((l: any) => l.name).join(", ")}</span> : <span>No original order on file</span>}
                </div>
                <div className="oc-actions" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <div className="field"><label>Status</label><select value={c.status} onChange={(e) => patch(c.id, { status: e.target.value })}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                  <div className="field"><label>Scheduled date</label><input type="date" defaultValue={c.scheduled_date || ""} onBlur={(e) => e.target.value !== (c.scheduled_date || "") && patch(c.id, { scheduled_date: e.target.value })} /></div>
                  <div className="field"><label>Comeback RO #</label><input defaultValue={c.sm_order_number || ""} placeholder="ShopMonkey RO" onBlur={(e) => e.target.value !== (c.sm_order_number || "") && patch(c.id, { sm_order_number: e.target.value })} /></div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}><label>Notes to the dealership (they see this)</label><input defaultValue={c.wga_notes || ""} placeholder="What we found, what we did, when it's done…" onBlur={(e) => e.target.value !== (c.wga_notes || "") && patch(c.id, { wga_notes: e.target.value, notify_note: true })} /></div>
                </div>
                {c.quote_id ? <div style={{ marginTop: 10 }}><a className="link-btn" href={`/wga/orders?open=${c.quote_id}`}>Open original order →</a></div> : null}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
