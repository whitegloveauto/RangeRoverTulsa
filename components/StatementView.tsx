"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsPhone } from "@/lib/useIsPhone";

const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nice = (ymd: string) => new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Billing statement: completed orders at WGA cost, totals and terms, CSV + print.
// `endpoint` is /api/wga/statements (with ?dealership=) or /api/statements (dealer admin).
export default function StatementView({ endpoint, query = "", audience }: { endpoint: string; query?: string; audience: "wga" | "dealer" }) {
  // Periods come from the server: weekly / every-2-weeks / monthly, per the dealership's payment schedule.
  const [period, setPeriod] = useState<string>("");
  const [st, setSt] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const isPhone = useIsPhone();
  const qs = [query, period ? `period=${period}` : ""].filter(Boolean).join("&");

  useEffect(() => {
    setLoading(true);
    setErr("");
    fetch(`${endpoint}?${qs}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load statement.");
        setSt(d.statement);
        if (!period) setPeriod(d.statement.period);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, qs]);

  return (
    <div>
      <div className="stmt-controls">
        <div className="field">
          <label htmlFor="stm">{st?.cycle === "weekly" ? "Week" : st?.cycle === "biweekly" ? "Pay period" : "Month"}</label>
          <select id="stm" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={!st}>
            {(st?.periods || []).map((p: any, i: number) => <option key={p.key} value={p.key}>{p.label}{st?.cycle === "weekly" || st?.cycle === "biweekly" ? ` · ${p.dueLabel}` : ""}{i === 0 ? " (current)" : ""}</option>)}
          </select>
        </div>
        {st ? <div className="stmt-terms">Terms: <b>{st.terms}</b></div> : null}
        <a className="btn-ghost btn-sm" href={`${endpoint}?${qs}&format=csv`} style={{ display: "inline-block" }}>Download CSV</a>
        <button className="btn-primary btn-sm" onClick={() => window.print()} disabled={!st || !st.count}>Print / save PDF</button>
      </div>

      {err ? <div className="notice warn" style={{ marginTop: 16 }}>{err}</div> : null}
      {loading && !st ? <div className="loading-text" style={{ marginTop: 20 }}>Loading statement…</div> : null}

      {st ? (
        <div style={{ marginTop: 18, opacity: loading ? 0.5 : 1 }}>
          <div className="stmt-print-head">
            {audience === "wga" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/wga-black.png" alt="White Glove Auto" style={{ height: 22, width: "auto" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            ) : null}
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }}>Statement · {st.label}{st.cycle === "weekly" || st.cycle === "biweekly" ? "" : ""}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Bill to <b>{st.dealership.name}</b>{st.dealership.location ? ` · ${st.dealership.location}` : ""}<br />
              From White Glove Auto · Tulsa, Oklahoma<br />
              Work completed {nice(st.from)} – {nice(st.to)} · {st.terms} · {st.dueLabel}
            </div>
          </div>

          <div className="stmt-totals">
            <div><div className="k">Orders completed</div><div className="v">{st.count}</div></div>
            <div><div className="k">{audience === "dealer" ? "Amount due to WGA" : "Bill the dealership"}</div><div className="v">{money(st.total)}</div></div>
            <div><div className="k">{st.terms}</div><div className="v">{st.dueDate ? nice(st.dueDate) : "On receipt"}</div></div>
            <div><div className="k">{audience === "dealer" ? "Your customer retail" : "Dealer retail (their price)"}</div><div className="v">{money(st.retailTotal)}</div></div>
          </div>

          {st.count === 0 ? (
            <div className="card" style={{ textAlign: "center" }}>No completed orders {st.cycle === "weekly" || st.cycle === "biweekly" ? `between ${nice(st.from)} and ${nice(st.to)}` : `in ${st.label}`}.</div>
          ) : isPhone ? (
            <div className="order-cards">
              {st.lines.map((l: any) => (
                <div key={l.id} className="card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <b>{l.vehicle}</b>
                    <b>{money(l.amount)}</b>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5 }}>
                    {nice(l.completed)} · {l.quote_number}{l.ro ? ` · RO ${l.ro}` : ""}<br />
                    {l.vin ? <><span className="vin">VIN {l.vin}</span><br /></> : null}
                    {l.services}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Completed</th><th>Order #</th><th>RO #</th><th>Vehicle</th><th>VIN</th><th>Services</th><th>Placed by</th><th style={{ textAlign: "right" }}>Amount</th></tr>
                </thead>
                <tbody>
                  {st.lines.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{nice(l.completed)}</td>
                      <td>{l.quote_number}</td>
                      <td>{l.ro || "—"}</td>
                      <td><b>{l.vehicle}</b></td>
                      <td className="vin">{l.vin || "—"}</td>
                      <td>{l.services}</td>
                      <td>{l.placed_by || "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{money(l.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={7} style={{ textAlign: "right" }}><b>Total · {st.count} order{st.count === 1 ? "" : "s"} · {st.terms} · {st.dueLabel}</b></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><b>{money(st.total)}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="no-print" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 12 }}>
            Orders count in the period they were marked complete (Tulsa time). Amounts are White Glove Auto&apos;s price to the dealership; comebacks and warranty work aren&apos;t billed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
