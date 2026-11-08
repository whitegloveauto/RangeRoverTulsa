"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsPhone } from "@/lib/useIsPhone";

const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nice = (ymd: string) => new Date(ymd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function monthOptions(): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 15);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ key, label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) + (i === 0 ? " (so far)" : "") });
  }
  return out;
}

// Monthly statement: completed orders at WGA cost, totals, net terms, CSV + print.
// `endpoint` is /api/wga/statements (with ?dealership=) or /api/statements (dealer admin).
export default function StatementView({ endpoint, query = "", audience }: { endpoint: string; query?: string; audience: "wga" | "dealer" }) {
  const months = useMemo(monthOptions, []);
  // Early in the month you're billing last month; later, this month.
  const [month, setMonth] = useState(() => (new Date().getDate() <= 7 ? months[1].key : months[0].key));
  const [st, setSt] = useState<any>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const isPhone = useIsPhone();
  const qs = `${query ? query + "&" : ""}month=${month}`;

  useEffect(() => {
    setLoading(true);
    setErr("");
    fetch(`${endpoint}?${qs}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load statement.");
        setSt(d.statement);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [endpoint, qs]);

  return (
    <div>
      <div className="stmt-controls">
        <div className="field">
          <label htmlFor="stm">Month</label>
          <select id="stm" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        <a className="btn-ghost btn-sm" href={`${endpoint}?${qs}&format=csv`} style={{ display: "inline-block" }}>Download CSV</a>
        <button className="btn-primary btn-sm" onClick={() => window.print()} disabled={!st || !st.count}>Print / save PDF</button>
      </div>

      {err ? <div className="notice warn" style={{ marginTop: 16 }}>{err}</div> : null}
      {loading && !st ? <div className="loading-text" style={{ marginTop: 20 }}>Loading statement…</div> : null}

      {st ? (
        <div style={{ marginTop: 18, opacity: loading ? 0.5 : 1 }}>
          <div className="stmt-print-head">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wga-black.png" alt="White Glove Auto" style={{ height: 22, width: "auto" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }}>Statement · {st.label}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Bill to <b>{st.dealership.name}</b>{st.dealership.location ? ` · ${st.dealership.location}` : ""}<br />
              From White Glove Auto · Tulsa, Oklahoma<br />
              Statement date {nice(st.statementDate)} · Net {st.terms} · Due {nice(st.dueDate)}
            </div>
          </div>

          <div className="stmt-totals">
            <div><div className="k">Orders completed</div><div className="v">{st.count}</div></div>
            <div><div className="k">{audience === "dealer" ? "Amount due to WGA" : "Bill the dealership"}</div><div className="v">{money(st.total)}</div></div>
            <div><div className="k">Net {st.terms} · due</div><div className="v">{nice(st.dueDate)}</div></div>
            <div><div className="k">{audience === "dealer" ? "Your customer retail" : "Dealer retail (their price)"}</div><div className="v">{money(st.retailTotal)}</div></div>
          </div>

          {st.count === 0 ? (
            <div className="card" style={{ textAlign: "center" }}>No completed orders in {st.label}.</div>
          ) : isPhone ? (
            <div className="order-cards">
              {st.lines.map((l: any) => (
                <div key={l.id} className="card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <b>{l.vehicle}</b>
                    <b>{money(l.amount)}</b>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6, lineHeight: 1.5 }}>
                    {nice(l.completed)} · {l.quote_number}{l.ro ? ` · RO ${l.ro}` : ""}{l.stock ? ` · Stock ${l.stock}` : ""}<br />
                    {l.services}{l.customer ? ` · ${l.customer}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Completed</th><th>Order #</th><th>RO #</th><th>Vehicle</th><th>Customer</th><th>Services</th><th>Placed by</th><th style={{ textAlign: "right" }}>Amount</th></tr>
                </thead>
                <tbody>
                  {st.lines.map((l: any) => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{nice(l.completed)}</td>
                      <td>{l.quote_number}</td>
                      <td>{l.ro || "—"}</td>
                      <td><b>{l.vehicle}</b>{l.stock || l.vin ? <div style={{ fontSize: 11, color: "var(--text-3)" }}>{l.stock ? `Stock ${l.stock}` : ""}{l.stock && l.vin ? " · " : ""}{l.vin ? `VIN …${l.vin.slice(-8)}` : ""}</div> : null}</td>
                      <td>{l.customer || "—"}</td>
                      <td>{l.services}</td>
                      <td>{l.placed_by || "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{money(l.amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={7} style={{ textAlign: "right" }}><b>Total · {st.count} order{st.count === 1 ? "" : "s"} · Net {st.terms}, due {nice(st.dueDate)}</b></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><b>{money(st.total)}</b></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="no-print" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 12 }}>
            Orders count in the month they were marked complete (Tulsa time). Amounts are White Glove Auto&apos;s price to the dealership; comebacks and warranty work aren&apos;t billed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
