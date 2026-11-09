"use client";

import { Fragment } from "react";
import type { PricingBook } from "@/lib/types";

// Branded, print-ready price sheet. Two layouts:
//  - vehicle: one model (optionally with year/trim), services as sections, one price column
//  - master:  all models × all packages, one table per service
// Light "paper" look regardless of the app theme; print CSS strips everything else.

export const SHEET_PRINT_CSS = `
  @media print {
    .no-print { display: none !important; }
    .sheet { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; padding: 0 !important; }
    body, html { background: #fff !important; }
    .ambient { display: none !important; }
    main { padding: 0 !important; }
    header.app { display: none !important; }
    .sheet-svc { break-inside: avoid; }
  }
  @page { margin: 0.5in; }
  .ms-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  @media screen and (max-width: 720px) {
    .ms-table { font-size: 10px !important; }
    .ms-table th, .ms-table td { padding-left: 5px !important; padding-right: 5px !important; }
    .ms-table td:first-child, .ms-table th:first-child { position: sticky; left: 0; background: #fff; padding-left: 0 !important; }
    .ms-table tr:nth-child(even) td:first-child { background: #F7F4ED; }
  }
  @media (max-width: 720px) {
    .sheet { padding: 22px 16px !important; }
    .sheet-letterhead { flex-direction: column; align-items: flex-start !important; gap: 14px; }
    .sheet-prepared { text-align: left !important; }
    .sheet-logos img:first-child { height: 34px !important; }
  }
`;

const paper = {
  ink: "#0C1A14",
  gold: "#8A7752",
  rule: "#DDD9CF",
  tint: "#F7F4ED",
  muted: "#555",
};

const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }));

function Letterhead({ dealership, right, logo, brandName }: { dealership: string; right?: React.ReactNode; logo?: string | null; brandName?: string | null }) {
  return (
    <div className="sheet-letterhead" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `2px solid ${paper.ink}`, paddingBottom: 18, marginBottom: 24 }}>
      <div className="sheet-logos" style={{ display: "flex", alignItems: "center", gap: 22 }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={brandName || "Dealership"} style={{ height: 44, width: "auto", maxWidth: 150, objectFit: "contain", display: "block" }} />
        ) : (
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: paper.ink }}>{brandName || dealership}</div>
        )}
      </div>
      <div className="sheet-prepared" style={{ textAlign: "right" }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: paper.gold, textTransform: "uppercase" }}>Protection pricing</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: paper.ink, marginTop: 2 }}>{dealership}</div>
        {right}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ marginTop: 32, paddingTop: 14, borderTop: `1px solid ${paper.rule}`, fontSize: 9.5, color: "#999", textAlign: "center", letterSpacing: "0.05em", lineHeight: 1.7 }}>
      Paint protection film: XPEL Ultimate Plus with manufacturer warranty · Ceramic coating: XPEL Fusion Plus · Window film: XPEL Prime
      <br />
      Professionally installed · Pricing subject to change; confirm at time of order.
    </div>
  );
}

export function VehicleSheet({
  logo,
  brandName,
  book,
  model,
  year,
  trim,
  dealership,
  showCost,
  showSuggested,
}: {
  book: PricingBook;
  model: string;
  year?: number | null;
  trim?: string | null;
  dealership: string;
  showCost: boolean;
  showSuggested: boolean;
  logo?: string | null;
  brandName?: string | null;
}) {
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const prices = book.prices[model] || {};
  return (
    <div className="sheet" style={{ width: "100%", maxWidth: 800, background: "#fff", color: "#1A1A1A", padding: "48px 56px 36px", boxShadow: "0 20px 60px rgba(0,0,0,0.4)", margin: "0 auto" }}>
      <Letterhead dealership={dealership} logo={logo} brandName={brandName} right={<div style={{ fontSize: 10, color: paper.muted, marginTop: 4 }}>{dateStr}</div>} />
      <div style={{ background: paper.tint, borderLeft: `3px solid #B89968`, padding: "16px 20px", marginBottom: 26 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.22em", color: paper.gold, textTransform: "uppercase", marginBottom: 6 }}>Protection pricing</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: paper.ink, lineHeight: 1.05 }}>
          {year ? year + " " : ""}
          {model}
          {trim ? <span style={{ fontStyle: "italic", color: paper.gold }}> {trim}</span> : null}
        </div>
      </div>
      {book.services.map((svc) => (
        <div key={svc.id} className="sheet-svc" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${paper.rule}`, paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: paper.ink, fontWeight: 700, textTransform: "uppercase" }}>{svc.name}</div>
            {svc.note ? <div style={{ fontSize: 9, letterSpacing: "0.16em", color: paper.gold, textTransform: "uppercase" }}>{svc.note}</div> : null}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: paper.muted }}>
                <th style={{ textAlign: "left", fontWeight: 500, padding: "4px 0" }}>Package</th>
                {showCost ? <th style={{ textAlign: "right", fontWeight: 500, padding: "4px 0", width: 110 }}>WGA cost</th> : null}
                {showSuggested ? <th style={{ textAlign: "right", fontWeight: 500, padding: "4px 0", width: 110 }}>Suggested</th> : null}
                <th style={{ textAlign: "right", fontWeight: 500, padding: "4px 0", width: 110 }}>{showCost || showSuggested ? "Price" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {svc.items.map((it) => {
                const c = prices[it.id];
                return (
                  <tr key={it.id} style={{ borderBottom: `1px solid ${paper.tint}` }}>
                    <td style={{ padding: "7px 0", color: "#333" }}>
                      {it.name}
                      {it.coverage || it.description ? <div style={{ fontSize: 10.5, color: paper.muted, lineHeight: 1.45 }}>{it.coverage || it.description}</div> : null}
                    </td>
                    {showCost ? <td style={{ textAlign: "right", color: paper.muted, fontVariantNumeric: "tabular-nums" }}>{money(c?.cost)}</td> : null}
                    {showSuggested ? <td style={{ textAlign: "right", color: paper.muted, fontVariantNumeric: "tabular-nums" }}>{money(c?.suggested_retail)}</td> : null}
                    <td style={{ textAlign: "right", color: paper.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money(c?.retail)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <Footer />
    </div>
  );
}

export function MasterSheet({ book, dealership, showCost, showSuggested, logo, brandName }: { book: PricingBook; dealership: string; showCost: boolean; showSuggested: boolean; logo?: string | null; brandName?: string | null }) {
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const cols = 1 + (showCost ? 1 : 0) + (showSuggested ? 1 : 0);
  const maxCols = Math.max(0, ...book.services.map((svc) => svc.items.length * cols));
  const wide = maxCols > 6; // too many columns for a portrait page
  return (
    <div className={"sheet master" + (wide ? " wide" : "")} style={{ width: "100%", maxWidth: wide ? 1240 : 1040, background: "#fff", color: "#1A1A1A", padding: "44px 48px 36px", boxShadow: "0 20px 60px rgba(0,0,0,0.4)", margin: "0 auto" }}>
      {wide ? <style>{`@media print { @page { size: landscape; margin: 0.4in; } .sheet.wide table { font-size: 10px !important; } }`}</style> : null}
      <Letterhead dealership={dealership} logo={logo} brandName={brandName} right={<div style={{ fontSize: 10, color: paper.muted, marginTop: 4 }}>Master price sheet · {dateStr}</div>} />
      {book.services.map((svc) => (
        <div key={svc.id} className="sheet-svc" style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${paper.ink}`, paddingBottom: 6, marginBottom: 4 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: paper.ink, fontWeight: 700, textTransform: "uppercase" }}>{svc.name}</div>
            {svc.note ? <div style={{ fontSize: 9, letterSpacing: "0.16em", color: paper.gold, textTransform: "uppercase" }}>{svc.note}</div> : null}
          </div>
          <div className="ms-scroll">
          <table className="ms-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontWeight: 500, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: paper.muted, padding: "6px 0", borderBottom: `1px solid ${paper.rule}` }}>Model</th>
                {svc.items.map((it) => (
                  <th key={it.id} colSpan={cols} style={{ textAlign: "right", fontWeight: 600, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase", color: paper.ink, padding: "6px 8px", borderBottom: `1px solid ${paper.rule}`, borderLeft: `1px solid ${paper.rule}` }}>
                    {it.name}
                  </th>
                ))}
              </tr>
              {cols > 1 ? (
                <tr>
                  <th style={{ borderBottom: `1px solid ${paper.rule}` }} />
                  {svc.items.map((it) => (
                    <Fragment key={it.id}>
                      {showCost ? <th key={it.id + "c"} style={{ textAlign: "right", fontWeight: 500, fontSize: 8.5, letterSpacing: "0.12em", color: paper.muted, padding: "2px 8px", borderBottom: `1px solid ${paper.rule}`, borderLeft: `1px solid ${paper.rule}` }}>COST</th> : null}
                      {showSuggested ? <th key={it.id + "s"} style={{ textAlign: "right", fontWeight: 500, fontSize: 8.5, letterSpacing: "0.12em", color: paper.muted, padding: "2px 8px", borderBottom: `1px solid ${paper.rule}`, borderLeft: showCost ? "none" : `1px solid ${paper.rule}` }}>SUGG.</th> : null}
                      <th key={it.id + "r"} style={{ textAlign: "right", fontWeight: 500, fontSize: 8.5, letterSpacing: "0.12em", color: paper.ink, padding: "2px 8px", borderBottom: `1px solid ${paper.rule}` }}>PRICE</th>
                    </Fragment>
                  ))}
                </tr>
              ) : null}
            </thead>
            <tbody>
              {book.models.map((m, i) => (
                <tr key={m} style={{ background: i % 2 ? paper.tint : "transparent" }}>
                  <td style={{ padding: "6px 0", color: "#333", fontWeight: 500, whiteSpace: "nowrap" }}>{m}</td>
                  {svc.items.map((it) => {
                    const c = book.prices[m]?.[it.id];
                    return (
                      <Fragment key={it.id}>
                        {showCost ? <td key={it.id + "c"} style={{ textAlign: "right", padding: "6px 8px", color: paper.muted, fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${paper.rule}` }}>{money(c?.cost)}</td> : null}
                        {showSuggested ? <td key={it.id + "s"} style={{ textAlign: "right", padding: "6px 8px", color: paper.muted, fontVariantNumeric: "tabular-nums", borderLeft: showCost ? "none" : `1px solid ${paper.rule}` }}>{money(c?.suggested_retail)}</td> : null}
                        <td key={it.id + "r"} style={{ textAlign: "right", padding: "6px 8px", color: paper.ink, fontWeight: 600, fontVariantNumeric: "tabular-nums", borderLeft: cols > 1 ? "none" : `1px solid ${paper.rule}` }}>{money(c?.retail)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      ))}
      <Footer />
    </div>
  );
}
