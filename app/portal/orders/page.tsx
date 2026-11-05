"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useDealerSession } from "@/lib/useDealerSession";

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const STATUS_LABEL: Record<string, string> = { draft: "Quote", new: "Submitted", in_shopmonkey: "Received", scheduled: "Scheduled", in_progress: "In progress", complete: "Complete", cancelled: "Cancelled" };

export default function OrdersPage() {
  const { session, ready } = useDealerSession();
  const [rows, setRows] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/quotes").then(async (r) => {
      if (r.ok) setRows((await r.json()).quotes || []);
      setLoaded(true);
    });
  }, [ready]);

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
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Quote #</th><th>Vehicle</th><th>Services</th><th>Customer / Stock</th><th>By</th><th>Status</th><th style={{ textAlign: "right" }}>Total</th>{session.user.canSeeCost ? <th style={{ textAlign: "right" }}>Your cost</th> : null}
                </tr>
              </thead>
              <tbody>
                {loaded && rows.length === 0 ? <tr><td colSpan={8} style={{ textAlign: "center", padding: 28 }}>No quotes yet. Start with a new quote.</td></tr> : null}
                {rows.map((q) => (
                  <tr key={q.id}>
                    <td><Link href={`/portal/quote/${q.id}`}><b>{q.quote_number}</b></Link></td>
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
          </div>
        </div>
      </main>
    </div>
  );
}
