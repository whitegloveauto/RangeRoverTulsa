"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getSelectedVehicle } from "@/lib/vehicleStore";
import type {
  PricingResponse,
  ProtectionPackage,
  AlacarteItem,
} from "@/lib/types";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

export default function PricingPage() {
  const router = useRouter();
  const [dealershipName, setDealershipName] = useState("");
  const [vehicle, setVehicle] = useState<{
    year: number;
    model: string;
    trim: string;
  } | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [expandedTier, setExpandedTier] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingMsg, setSavingMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Customer / deal detail (all optional for a quote; helpful on an order)
  const [customerName, setCustomerName] = useState("");
  const [stockNumber, setStockNumber] = useState("");
  const [vin, setVin] = useState("");

  useEffect(() => {
    const v = getSelectedVehicle();
    if (!v) {
      router.replace("/portal/vehicle");
      return;
    }
    setVehicle(v);

    (async () => {
      const sessRes = await fetch("/api/auth/session");
      if (!sessRes.ok) {
        router.replace("/");
        return;
      }
      const sess = await sessRes.json();
      setDealershipName(sess.dealership.name);

      const priceRes = await fetch("/api/pricing");
      if (priceRes.ok) {
        setPricing(await priceRes.json());
      }
      setLoading(false);
    })();
  }, [router]);

  const acIndex = useMemo(() => {
    const idx: Record<string, AlacarteItem> = {};
    pricing?.alacarte.forEach((a) => (idx[a.item_key] = a));
    return idx;
  }, [pricing]);

  const acGroups = useMemo(() => {
    const groups: Record<string, AlacarteItem[]> = {};
    pricing?.alacarte.forEach((a) => {
      if (!groups[a.group_label]) groups[a.group_label] = [];
      groups[a.group_label].push(a);
    });
    return groups;
  }, [pricing]);

  const totals = useMemo(() => {
    const items = Array.from(selected).map((k) => acIndex[k]).filter(Boolean);
    const retail = items.reduce((s, i) => s + i.retail, 0);
    const cost = items.reduce((s, i) => s + i.cost, 0);
    return { retail, cost, gross: retail - cost, count: items.length };
  }, [selected, acIndex]);

  function toggleTier(tier: string) {
    setExpandedTier((cur) => (cur === tier ? null : tier));
  }

  function toggleAc(key: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Combined quote = selected package (optional) + selected à la carte panels (optional)
  const selectedPackage = useMemo(
    () => pricing?.packages.find((p) => p.tier === selectedTier) || null,
    [pricing, selectedTier]
  );

  const combinedTotals = useMemo(() => {
    const pkgRetail = selectedPackage?.retail_total || 0;
    const pkgCost = selectedPackage?.cost_total || 0;
    return {
      retail: pkgRetail + totals.retail,
      cost: pkgCost + totals.cost,
      gross: pkgRetail + totals.retail - (pkgCost + totals.cost),
      hasAnything: !!selectedPackage || totals.count > 0,
    };
  }, [selectedPackage, totals]);

  // mode: 'draft' | 'print' | 'submit'
  async function buildQuote(mode: "draft" | "print" | "submit") {
    if (!vehicle || !combinedTotals.hasAnything) return;
    setBusy(true);
    setSavingMsg(
      mode === "submit" ? "Submitting order…" : "Saving…"
    );

    const alacarteSelected = Array.from(selected).map((k) => acIndex[k]);

    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleYear: vehicle.year,
        vehicleModel: vehicle.model,
        vehicleTrim: vehicle.trim,
        vehicleVin: vin || null,
        packageTier: selectedPackage?.tier || null,
        packageSnapshot: selectedPackage || null,
        alacarteItems: alacarteSelected,
        retailTotal: combinedTotals.retail,
        costTotal: combinedTotals.cost,
        grossTotal: combinedTotals.gross,
        customerName: customerName || null,
        stockNumber: stockNumber || null,
        submit: mode === "submit",
      }),
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setSavingMsg(data.error || "Save failed.");
      setTimeout(() => setSavingMsg(""), 4000);
      return;
    }

    if (mode === "print") {
      router.push(`/portal/quote/${data.quote.id}`);
      return;
    }

    if (mode === "submit") {
      setSavingMsg(
        `Order submitted · ${data.quote.quote_number} — sent to White Glove Auto`
      );
    } else {
      setSavingMsg(`Draft saved · ${data.quote.quote_number}`);
    }
    setTimeout(() => setSavingMsg(""), 5000);
  }

  if (loading || !vehicle) {
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

  return (
    <div className="frame">
      <AppHeader dealershipName={dealershipName} />
      <main>
        <nav className="step-rail">
          <div className="step done">
            <span className="num">1</span> Vehicle Selected
          </div>
          <div className="step active">
            <span className="num">2</span> Review Pricing
          </div>
          <div className="step">
            <span className="num">3</span> Generate Quote
          </div>
        </nav>

        <section className="stage">
          {/* Nameplate */}
          <div className="nameplate">
            <div className="meta">VEHICLE CONFIGURED</div>
            <div className="year-model">
              {vehicle.year} {vehicle.model}
            </div>
            <div className="trim">{vehicle.trim}</div>
            <div className="vin">
              PROGRAM PRICING &nbsp;·&nbsp; FIXED RATE ACROSS ALL RANGE ROVER
              VEHICLES
            </div>
          </div>

          {savingMsg && (
            <div
              style={{
                marginBottom: 24,
                padding: "12px 18px",
                border: "1px solid var(--gold-dim)",
                background: "rgba(184,153,104,0.08)",
                color: "var(--gold-bright)",
                fontSize: 12,
                letterSpacing: "0.06em",
              }}
            >
              {savingMsg}
            </div>
          )}

          <div className="section-eyebrow">PROTECTION PACKAGES</div>

          {pricing?.packages.map((p) => {
            const expanded = expandedTier === p.tier;
            const isSelected = selectedTier === p.tier;
            return (
              <div
                key={p.id}
                className={`package${expanded || isSelected ? " selected" : ""}`}
                onClick={() => toggleTier(p.tier)}
                style={{ cursor: "pointer" }}
              >
                <div className="pkg-tier">
                  <span className="index">{p.tier_index}</span>
                  {p.tier}
                  {isSelected && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 6,
                        fontSize: 9,
                        letterSpacing: "0.18em",
                        color: "var(--gold-bright)",
                      }}
                    >
                      ✓ SELECTED
                    </span>
                  )}
                </div>
                <div className="pkg-includes">
                  {p.items.map((it, i) => (
                    <div className="line" key={i}>
                      {it.name}
                    </div>
                  ))}
                </div>
                <div className="pkg-price">
                  <div className="amount">{fmt(p.retail_total)}</div>
                  <div className="label">F&amp;I Retail</div>
                  <div className="cost">
                    Dealer cost <b>{fmt(p.cost_total)}</b> &nbsp;·&nbsp; Gross{" "}
                    <b>{fmt(p.gross_total)}</b>
                  </div>
                </div>

                {expanded && (
                  <div className="pkg-detail">
                    <div
                      style={{
                        marginBottom: 14,
                        fontSize: 10,
                        letterSpacing: "0.22em",
                        color: "var(--gold)",
                      }}
                    >
                      LINE-ITEM DETAIL
                    </div>
                    {p.items.map((it, i) => (
                      <div className="row" key={i}>
                        <span className="name">{it.name}</span>
                        <span className="num">{fmt(it.retail)}</span>
                      </div>
                    ))}
                    <div className="totals">
                      <div className="cell">
                        <div className="lbl">F&amp;I Retail</div>
                        <div className="val">{fmt(p.retail_total)}</div>
                      </div>
                      <div className="cell">
                        <div className="lbl">Dealer Cost</div>
                        <div className="val">{fmt(p.cost_total)}</div>
                      </div>
                      <div className="cell gross">
                        <div className="lbl">Gross Profit</div>
                        <div className="val">{fmt(p.gross_total)}</div>
                      </div>
                    </div>
                    <div className="actions">
                      <button
                        className={isSelected ? "btn-ghost" : "btn-primary"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTier(isSelected ? null : p.tier);
                        }}
                      >
                        {isSelected ? "Remove from Quote" : "Add to Quote"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Tint upgrade strip */}
          {pricing?.tintUpgrade && (
            <div className="upgrade-strip">
              <div className="left">
                <b>Optional Upgrade</b> &nbsp;·&nbsp; Extend tint coverage from
                2-door to full vehicle (any tier)
              </div>
              <div className="right">
                + {fmt(pricing.tintUpgrade.retail)} retail
              </div>
            </div>
          )}

          {/* À la carte */}
          <div className="alacarte">
            <div className="alacarte-head">
              <div
                className="section-eyebrow"
                style={{ marginBottom: 14 }}
              >
                À LA CARTE COVERAGE
              </div>
              <h3 className="alacarte-title">Custom protection. Exact pricing.</h3>
              <p className="alacarte-sub">
                For coverage outside the standard packages — individual panels,
                custom configurations, or specialty installations — select
                per-panel options priced direct from the XPEL Design Access
                Program.
              </p>
            </div>

            <div className="alacarte-vehicle">
              <div className="av-left">
                <span className="av-for">FOR</span>
                <span className="av-name">
                  {vehicle.year} {vehicle.model} {vehicle.trim}
                </span>
              </div>
              <div className="av-source">
                XPEL DAP &nbsp;·&nbsp; 8 MIL ULTIMATE PLUS 10
              </div>
            </div>

            {Object.entries(acGroups).map(([group, items]) => (
              <div className="ac-group" key={group}>
                <div className="ac-group-label">{group}</div>
                {items.map((it) => (
                  <div
                    key={it.item_key}
                    className={`ac-panel${
                      selected.has(it.item_key) ? " selected" : ""
                    }`}
                    onClick={() => toggleAc(it.item_key)}
                  >
                    <div className="ac-check" />
                    <div className="ac-name">{it.name}</div>
                    <div className="ac-price">{fmt(it.retail)}</div>
                  </div>
                ))}
              </div>
            ))}

            <div className="ac-totals">
              <div className="ac-totals-summary">
                <div className="ac-eyebrow">À LA CARTE SELECTIONS</div>
                <div className="ac-count">
                  {totals.count === 0
                    ? "No panels selected"
                    : totals.count === 1
                    ? "1 panel selected"
                    : `${totals.count} panels selected`}
                </div>
              </div>
              <div className="ac-totals-amount">
                <div className="ac-amount">{fmt(totals.retail)}</div>
                <div className="ac-meta">
                  <span>Dealer cost {fmt(totals.cost)}</span>
                  <span className="dim">·</span>
                  <span>Gross {fmt(totals.gross)}</span>
                </div>
              </div>
              <div className="ac-totals-actions">
                <span style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.04em" }}>
                  Added to quote below
                </span>
              </div>
            </div>
          </div>

          {/* ============ DEAL BUILDER / ACTION BAR ============ */}
          <div className="deal-builder">
            <div className="db-head">
              <div className="section-eyebrow" style={{ marginBottom: 14 }}>
                FINALIZE
              </div>
              <h3 className="alacarte-title">Build the deal.</h3>
            </div>

            {/* Current quote summary */}
            <div className="db-summary">
              {selectedPackage && (
                <div className="db-line">
                  <span className="db-line-name">
                    {selectedPackage.tier} Package
                  </span>
                  <span className="db-line-amt">
                    {fmt(selectedPackage.retail_total)}
                  </span>
                </div>
              )}
              {Array.from(selected).map((k) => {
                const it = acIndex[k];
                if (!it) return null;
                return (
                  <div className="db-line" key={k}>
                    <span className="db-line-name">{it.name}</span>
                    <span className="db-line-amt">{fmt(it.retail)}</span>
                  </div>
                );
              })}
              {!combinedTotals.hasAnything && (
                <div className="db-empty">
                  Select a package above or add à la carte panels to build a quote.
                </div>
              )}
              {combinedTotals.hasAnything && (
                <div className="db-total">
                  <span>TOTAL</span>
                  <span className="db-total-amt">{fmt(combinedTotals.retail)}</span>
                </div>
              )}
            </div>

            {/* Optional customer detail */}
            <div className="db-fields">
              <div className="field">
                <label htmlFor="cust">Customer Name <span style={{color:"var(--text-3)"}}>(optional)</span></label>
                <input
                  id="cust"
                  type="text"
                  placeholder="e.g. John Smith"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="stock">Stock # <span style={{color:"var(--text-3)"}}>(optional)</span></label>
                <input
                  id="stock"
                  type="text"
                  placeholder="e.g. RR2451"
                  value={stockNumber}
                  onChange={(e) => setStockNumber(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="vin">VIN <span style={{color:"var(--text-3)"}}>(optional)</span></label>
                <input
                  id="vin"
                  type="text"
                  placeholder="Last 8 or full VIN"
                  value={vin}
                  onChange={(e) => setVin(e.target.value)}
                />
              </div>
            </div>

            {/* Three actions */}
            <div className="db-actions">
              <button
                className="btn-ghost"
                disabled={!combinedTotals.hasAnything || busy}
                onClick={() => buildQuote("draft")}
              >
                Save Draft
              </button>
              <button
                className="btn-ghost"
                disabled={!combinedTotals.hasAnything || busy}
                onClick={() => buildQuote("print")}
              >
                Save &amp; Print
              </button>
              <button
                className="btn-primary"
                disabled={!combinedTotals.hasAnything || busy}
                onClick={() => buildQuote("submit")}
              >
                Submit Order
              </button>
            </div>
            <div className="db-note">
              <b>Save Draft</b> keeps it for later · <b>Save &amp; Print</b> opens a
              branded quote sheet to print or save as PDF · <b>Submit Order</b> sends
              the deal to White Glove Auto to begin work.
            </div>
          </div>

          <div className="footer-line">
            <button
              className="reset"
              onClick={() => router.push("/portal/vehicle")}
            >
              ← BACK TO VEHICLE SELECT
            </button>
            <span>
              RANGE ROVER · TULSA &nbsp;·&nbsp; WHITE GLOVE AUTO DEALERSHIP
              PORTAL
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
