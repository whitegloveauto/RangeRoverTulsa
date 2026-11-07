"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { useDealerSession } from "@/lib/useDealerSession";
import { useIsPhone } from "@/lib/useIsPhone";

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const STATUS_LABEL: Record<string, string> = { draft: "Quote", new: "Submitted", in_shopmonkey: "Received", scheduled: "Scheduled", in_progress: "In progress", complete: "Complete", cancelled: "Cancelled" };

export default function OrdersPage() {
  const { session, ready } = useDealerSession();
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"open" | "all" | "draft" | "complete">("open");
  const isPhone = useIsPhone();
  const router = useRouter();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!ready) return;
    fetch("/api/quotes").then(async (r) => {
      if (r.ok) setRows((await r.json()).quotes || []);
      setLoaded(true);
    });
  }, [ready]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (filter === "open" && (r.status === "draft" || r.status === "complete" || r.status === "cancelled")) return false;
    if (filter === "draft" && r.status !== "draft") return false;
    if (filter === "complete" && r.status !== "complete" && r.status !== "cancelled") return false;
    if (!needle) return true;
    const hay = [r.quote_number, r.vehicle_year, r.vehicle_model, r.vehicle_trim, r.stock_number, r.customer_name, r.sm_order_number, r.dealer_user_name, ...(r.line_items || []).map((l: any) => l.name)].join(" ").toLowerCase();
    return hay.includes(needle);
  });
  const emptyText = rows.length === 0 ? "Nothing yet. Tap New Quote, pick the vehicle, choose the protection and send it — it shows up here with its ticket number." : needle ? "No orders match that search." : filter === "open" ? "No open orders. Switch to All to see completed ones." : "Nothing here.";

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;

  return (
    <div className="frame">
      <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
      <main>
        <div className="stage">
          <div className="stage-head">
            <div className="stage-eyebrow">ORDERS &amp; QUOTES</div>
            <div className="stage-title">Your orders.</div>
            <div className="stage-sub">{session.user.role === "admin" ? "Everything submitted by your dealership." : "Quotes and orders you've created."}</div>
          </div>
          <div className="toolbar" style={{ gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div className="tabs" style={{ margin: 0, borderBottom: 0 }}>
              {([["open", "Open"], ["all", "All"], ["draft", "Quotes"], ["complete", "Done"]] as const).map(([k, l]) => <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
            <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer, stock #, VIN, RO…" aria-label="Search orders" />
          </div>
          {/* Phone: one card per order */}
          {isPhone ? <div className="order-cards">
            {loaded && shown.length === 0 ? <div className="card" style={{ textAlign: "center" }}>{emptyText}</div> : null}
            {shown.map((q) => (
              <Link key={q.id} href={`/portal/quote/${q.id}`} className="order-card">
                <div className="oc-top">
                  <span className={"status-pill " + q.status}>{STATUS_LABEL[q.status] || q.status}</span>
                  <span className="oc-num">{q.quote_number}</span>
                </div>
                <div className="oc-vehicle">{q.vehicle_year} {q.vehicle_model} <span>{q.vehicle_trim}</span></div>
                <div className="oc-services">{(q.line_items || []).map((l: any) => l.name).join(" · ") || "—"}</div>
                <div className="oc-meta">
                  {q.customer_name ? <span>{q.customer_name}</span> : null}
                  {q.stock_number ? <span>Stock {q.stock_number}</span> : null}
                  {q.needed_by ? <span>Needed by {q.needed_by}</span> : null}
                  {q.scheduled_date ? <span>Scheduled {q.scheduled_date}</span> : null}
                  {q.sm_order_number ? <span>RO {q.sm_order_number}</span> : null}
                  {q.dealer_user_name ? <span>{q.dealer_user_name}</span> : null}
                </div>
                <div className="oc-totals">
                  <div><small>Retail</small><b>{money(q.retail_total)}</b></div>
                  {session.user.canSeeCost ? <div><small>Your cost</small><b>{money(q.cost_total)}</b></div> : null}
                </div>
              </Link>
            ))}
          </div> : null}
          {!isPhone ? <div className="tbl-wrap desktop-only">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Quote #</th><th>Vehicle</th><th>Services</th><th>Customer / Stock</th><th>By</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th>{session.user.canSeeCost ? <th style={{ textAlign: "right" }}>Your cost</th> : null}
                </tr>
              </thead>
              <tbody>
                {loaded && shown.length === 0 ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 28 }}>{emptyText}</td></tr> : null}
                {shown.map((q) => (
                  <tr key={q.id} onClick={() => router.push(`/portal/quote/${q.id}`)} style={{ cursor: "pointer" }} title="Open">
                    <td><Link href={`/portal/quote/${q.id}`}><b>{q.quote_number}</b></Link>{q.sm_order_number ? <div style={{ fontSize: 11, color: "var(--gold-bright)" }}>RO {q.sm_order_number}</div> : null}</td>
                    <td><b>{q.vehicle_year} {q.vehicle_model}</b><br /><span style={{ fontSize: 11 }}>{q.vehicle_trim}</span></td>
                    <td>{(q.line_items || []).map((l: any) => l.name).join(", ") || "—"}</td>
                    <td>{q.customer_name || "—"}{q.stock_number ? <><br /><span style={{ fontSize: 11 }}>Stock {q.stock_number}</span></> : null}</td>
                    <td>{q.dealer_user_name || "—"}</td>
                    <td><span className={"status-pill " + q.status}>{STATUS_LABEL[q.status] || q.status}</span>{q.scheduled_date ? <div style={{ fontSize: 11, marginTop: 4 }}>{q.scheduled_date}</div> : null}</td>
                    <td className="num"><b>{money(q.retail_total)}</b></td>
                    {session.user.canSeeCost ? <td className="num">{money(q.cost_total)}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div> : null}
        </div>
      </main>
    </div>
  );
}
