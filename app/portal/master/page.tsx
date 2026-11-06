"use client";

import { useEffect, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useDealerSession } from "@/lib/useDealerSession";
import { MasterSheet, SHEET_PRINT_CSS } from "@/components/PriceSheet";
import type { PricingBook } from "@/lib/types";

export default function MasterPage() {
  const { session, ready } = useDealerSession();
  const [book, setBook] = useState<PricingBook | null>(null);
  const [showCost, setShowCost] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/pricing").then(async (r) => r.ok && setBook(await r.json()));
  }, [ready]);

  if (!ready || !session || !book) {
    return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading master sheet…</div></div></main></div>;
  }
  return (
    <div className="frame">
      <style>{SHEET_PRINT_CSS}</style>
      <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
      <div className="no-print toolbar" style={{ padding: "18px 32px", borderBottom: "1px solid var(--stroke-soft)", marginBottom: 0 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--gold)" }}>MASTER PRICE SHEET · ALL MODELS</span>
        <span className="grow" />
        {book.canSeeCost ? (
          <label className="check"><input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} /> Show WGA cost</label>
        ) : null}
        <label className="check"><input type="checkbox" checked={showSuggested} onChange={(e) => setShowSuggested(e.target.checked)} /> Show suggested</label>
        <button className="btn-primary btn-sm" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <main style={{ padding: "40px 20px" }}>
        <MasterSheet book={book} dealership={session.dealership.name} logo={session.brand?.logo_url} brandName={session.brand?.name} showCost={showCost && book.canSeeCost} showSuggested={showSuggested} />
      </main>
    </div>
  );
}
