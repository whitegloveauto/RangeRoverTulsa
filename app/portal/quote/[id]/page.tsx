"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function fmt(n: number) {
  return "$" + Number(n).toLocaleString("en-US");
}

interface QuoteData {
  quote_number: string;
  vehicle_year: number;
  vehicle_model: string;
  vehicle_trim: string;
  vehicle_vin: string | null;
  customer_name: string | null;
  stock_number: string | null;
  package_tier: string | null;
  package_snapshot: any;
  tint_upgrade: boolean;
  alacarte_items: any[];
  retail_total: number;
  status: string;
  created_at: string;
}

export default function QuoteSheetPage() {
  const params = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [dealership, setDealership] = useState<{ name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/quotes/${params.id}`);
      if (!res.ok) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setQuote(data.quote);
      setDealership(data.dealership);
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) {
    return (
      <div className="frame">
        <main>
          <div className="loading-stage">
            <div className="loading-text">Loading quote…</div>
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !quote) {
    return (
      <div className="frame">
        <main>
          <div className="loading-stage">
            <div className="loading-text">Quote not found.</div>
          </div>
        </main>
      </div>
    );
  }

  const dateStr = new Date(quote.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build line items: package items + tint upgrade + à la carte
  const packageItems: { name: string; retail: number }[] =
    quote.package_snapshot?.items || [];
  const alacarte: { name: string; retail: number }[] = quote.alacarte_items || [];

  return (
    <>
      {/* Print-specific styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; }
          body { background: #fff !important; }
          .ambient { display: none !important; }
          main { padding: 0 !important; }
        }
        @page { size: portrait; margin: 0.5in; }
      `}</style>

      <div className="frame">
        {/* Action bar — hidden when printing */}
        <div
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "18px 32px",
            borderBottom: "1px solid var(--stroke-soft)",
          }}
        >
          <button className="reset" onClick={() => router.back()}>
            ← BACK
          </button>
          <button className="btn-primary" onClick={() => window.print()}>
            Print / Save PDF
          </button>
        </div>

        <main style={{ display: "flex", justifyContent: "center", padding: "40px 20px" }}>
          <div
            className="sheet"
            style={{
              width: "100%",
              maxWidth: 780,
              background: "#FFFFFF",
              color: "#1A1A1A",
              padding: "56px 56px 40px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
            }}
          >
            {/* Letterhead */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                borderBottom: "2px solid #0C1A14",
                paddingBottom: 20,
                marginBottom: 8,
              }}
            >
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/wga-black.png"
                  alt="White Glove Auto"
                  style={{ height: 32, width: "auto", display: "block", marginBottom: 6 }}
                />
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    color: "#8A7752",
                    textTransform: "uppercase",
                  }}
                >
                  Paint Protection · Ceramic · Window Film
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.2em",
                    color: "#8A7752",
                    textTransform: "uppercase",
                  }}
                >
                  Prepared For
                </div>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: 18,
                    color: "#0C1A14",
                    marginTop: 2,
                  }}
                >
                  {dealership?.name || quote.vehicle_model}
                </div>
              </div>
            </div>

            {/* Title row */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: 28,
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontStyle: "italic",
                  fontSize: 34,
                  color: "#0C1A14",
                }}
              >
                Protection Quote
              </div>
              <div style={{ textAlign: "right", fontSize: 11, color: "#555" }}>
                <div>
                  <b style={{ color: "#0C1A14" }}>{quote.quote_number}</b>
                </div>
                <div style={{ marginTop: 2 }}>{dateStr}</div>
              </div>
            </div>

            {/* Vehicle block */}
            <div
              style={{
                background: "#F7F4ED",
                borderLeft: "3px solid #B89968",
                padding: "16px 20px",
                marginBottom: 28,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  color: "#8A7752",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Vehicle
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 22,
                  color: "#0C1A14",
                }}
              >
                {quote.vehicle_year} {quote.vehicle_model}{" "}
                <span style={{ fontStyle: "italic", color: "#8A7752" }}>
                  {quote.vehicle_trim}
                </span>
              </div>
              <div style={{ display: "flex", gap: 24, marginTop: 8, fontSize: 11, color: "#555" }}>
                {quote.vehicle_vin && <span>VIN: {quote.vehicle_vin}</span>}
                {quote.stock_number && <span>Stock #: {quote.stock_number}</span>}
                {quote.customer_name && <span>Customer: {quote.customer_name}</span>}
              </div>
            </div>

            {/* Package section */}
            {quote.package_tier && (
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.2em",
                    color: "#0C1A14",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 12,
                    paddingBottom: 6,
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  {quote.package_tier} Package
                </div>
                {packageItems.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "7px 0",
                      fontSize: 13,
                      color: "#333",
                    }}
                  >
                    <span>{it.name}</span>
                    <span style={{ color: "#0C1A14" }}>{fmt(it.retail)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* À la carte section */}
            {alacarte.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.2em",
                    color: "#0C1A14",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    marginBottom: 12,
                    paddingBottom: 6,
                    borderBottom: "1px solid #ddd",
                  }}
                >
                  À La Carte Coverage
                </div>
                {alacarte.map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "7px 0",
                      fontSize: 13,
                      color: "#333",
                    }}
                  >
                    <span>{it.name}</span>
                    <span style={{ color: "#0C1A14" }}>{fmt(it.retail)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tint upgrade note */}
            {quote.tint_upgrade && (
              <div
                style={{
                  fontSize: 12,
                  color: "#8A7752",
                  fontStyle: "italic",
                  marginBottom: 20,
                }}
              >
                + Full-vehicle tint upgrade included
              </div>
            )}

            {/* Total */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 28,
                padding: "18px 24px",
                background: "#0C1A14",
                color: "#F7F4ED",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: "#B89968",
                }}
              >
                Total Investment
              </div>
              <div
                style={{
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: 30,
                  fontWeight: 500,
                }}
              >
                {fmt(quote.retail_total)}
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                marginTop: 36,
                paddingTop: 18,
                borderTop: "1px solid #ddd",
                fontSize: 10,
                color: "#999",
                textAlign: "center",
                letterSpacing: "0.06em",
                lineHeight: 1.7,
              }}
            >
              All paint protection film installed using XPEL Ultimate Plus 10 with
              manufacturer warranty. Window tint includes lifetime warranty.
              <br />
              White Glove Auto · Glenpool, Oklahoma · This quote is valid for 30
              days from the date above.
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
