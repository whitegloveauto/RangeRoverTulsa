"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getSelectedVehicle } from "@/lib/vehicleStore";
import { useDealerSession } from "@/lib/useDealerSession";
import type { PricingBook } from "@/lib/types";

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));

export default function PricingPage() {
  const router = useRouter();
  const { session, ready } = useDealerSession();
  const [vehicle, setVehicle] = useState<{ year: number; model: string; trim: string } | null>(null);
  const [book, setBook] = useState<PricingBook | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [stockNumber, setStockNumber] = useState("");
  const [vin, setVin] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>({ text: "" });

  useEffect(() => {
    const v = getSelectedVehicle();
    if (!v) {
      router.replace("/portal/vehicle");
      return;
    }
    setVehicle(v);
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/pricing").then(async (r) => r.ok && setBook(await r.json()));
  }, [ready]);

  const prices = useMemo(() => (book && vehicle ? book.prices[vehicle.model] || {} : {}), [book, vehicle]);

  const totals = useMemo(() => {
    let retail = 0,
      cost = 0,
      count = 0;
    for (const id of Array.from(selected)) {
      const c = prices[id];
      if (!c) continue;
      retail += c.retail ?? 0;
      cost += c.cost ?? 0;
      count++;
    }
    return { retail, cost, count };
  }, [selected, prices]);

  function toggle(id: string) {
    const c = prices[id];
    if (!c || c.retail === null) return;
    setSelected((cur) => {
      const n = new Set(cur);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function save(submit: boolean) {
    if (!vehicle || !selected.size) return;
    setBusy(true);
    setMsg({ text: "" });
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleYear: vehicle.year,
        vehicleModel: vehicle.model,
        vehicleTrim: vehicle.trim,
        vehicleVin: vin,
        stockNumber,
        customerName,
        customerPhone,
        notes,
        itemIds: Array.from(selected),
        submit,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: data.error || "Could not save.", err: true });
      return;
    }
    if (submit) {
      setMsg({ text: `Order ${data.quote.quote_number} sent to White Glove Auto.` });
      router.push(`/portal/quote/${data.quote.id}`);
    } else {
      setMsg({ text: `Quote ${data.quote.quote_number} saved.` });
      router.push(`/portal/quote/${data.quote.id}`);
    }
  }

  if (!ready || !session || !vehicle || !book) {
    return (
      <div className="frame">
        <main>
          <div className="loading-stage">
            <div className="loading-text">Loading pricing…</div>
          </div>
        </main>
      </div>
    );
  }

  const sheetHref = `/portal/sheet?model=${encodeURIComponent(vehicle.model)}&year=${vehicle.year}&trim=${encodeURIComponent(vehicle.trim)}`;

  return (
    <div className="frame">
      <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
      <main>
        <div className="step-rail">
          <div className="step done"><span className="num">1</span> Vehicle</div>
          <div className="step active"><span className="num">2</span> Pricing</div>
          <div className="step"><span className="num">3</span> Order</div>
        </div>

        <div className="stage">
          <div className="nameplate" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div className="meta">{session.dealership.brand.toUpperCase()} · {vehicle.year}</div>
              <div className="year-model">{vehicle.model}</div>
              <div className="trim">{vehicle.trim}</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href={sheetHref} className="btn-ghost btn-sm" style={{ display: "inline-block" }}>
                Print price sheet
              </Link>
              <button className="reset" onClick={() => router.push("/portal/vehicle")}>CHANGE VEHICLE</button>
            </div>
          </div>

          {book.services.map((svc) => (
            <div key={svc.id} className="svc-block">
              <div className="svc-head">
                <div className="svc-title">{svc.name}</div>
                {svc.note ? <div className="svc-note">{svc.note}</div> : null}
              </div>
              {svc.items.length === 0 ? <div style={{ padding: "14px 24px", fontSize: 12, color: "var(--text-3)" }}>No packages yet.</div> : null}
              {svc.items.map((it) => {
                const c = prices[it.id];
                const unpriced = !c || c.retail === null;
                const on = selected.has(it.id);
                return (
                  <div key={it.id} className={"svc-item" + (on ? " selected" : "") + (unpriced ? " unpriced" : "")} onClick={() => toggle(it.id)} role="checkbox" aria-checked={on}>
                    <div className={"ac-check"} style={on ? { borderColor: "var(--gold)", background: "var(--gold)" } : undefined} />
                    <div className="nm">
                      {it.name}
                      {it.description ? <small>{it.description}</small> : null}
                      {unpriced ? <small>Not priced for this model yet</small> : null}
                    </div>
                    <div className="pr">
                      <div className="retail">{money(c?.retail)}</div>
                      {book.canSeeCost && c && c.cost !== null ? (
                        <div className="cost">
                          cost <b>{money(c.cost)}</b> · margin <b>{money((c.retail ?? 0) - c.cost)}</b>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="deal-builder">
            <div className="db-head">
              <div className="section-eyebrow">ORDER</div>
              <div className="alacarte-title">Build the order</div>
            </div>
            <div className="db-summary">
              {totals.count === 0 ? <div className="db-empty">Select the services above to add them to this order.</div> : null}
              {Array.from(selected).map((id) => {
                const it = book.services.flatMap((s) => s.items).find((i) => i.id === id);
                const c = prices[id];
                return it ? (
                  <div key={id} className="db-line">
                    <span className="db-line-name">{it.name}</span>
                    <span className="db-line-amt">{money(c?.retail)}</span>
                  </div>
                ) : null;
              })}
              <div className="db-total">
                <span>TOTAL{book.canSeeCost && totals.count ? ` · YOUR COST ${money(totals.cost)}` : ""}</span>
                <span className="db-total-amt">{money(totals.retail)}</span>
              </div>
            </div>
            <div className="db-fields">
              <div className="field"><label htmlFor="cust">Customer name</label><input id="cust" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional for a quote" /></div>
              <div className="field"><label htmlFor="phone">Customer phone</label><input id="phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" /></div>
              <div className="field"><label htmlFor="stock">Stock #</label><input id="stock" value={stockNumber} onChange={(e) => setStockNumber(e.target.value)} /></div>
              <div className="field"><label htmlFor="vin">VIN</label><input id="vin" value={vin} onChange={(e) => setVin(e.target.value)} placeholder="17 characters" /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="notes">Notes for White Glove Auto</label><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery date, special requests…" /></div>
            </div>
            <div className="db-actions">
              <button className="btn-ghost" disabled={busy || !totals.count} onClick={() => save(false)}>Save quote</button>
              <button className="btn-primary" disabled={busy || !totals.count} onClick={() => save(true)}>{busy ? "Sending…" : "Submit order"}</button>
            </div>
            <div className="db-note" style={{ color: msg.err ? "var(--warn)" : undefined }}>
              {msg.text || (
                <>
                  <b>Save quote</b> keeps it for later. <b>Submit order</b> sends the vehicle and selected services to White Glove Auto for scheduling.
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
