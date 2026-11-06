"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDealerSession } from "@/lib/useDealerSession";
import { getSelectedVehicle } from "@/lib/vehicleStore";
import { VehicleSheet, SHEET_PRINT_CSS } from "@/components/PriceSheet";
import type { PricingBook } from "@/lib/types";

function SheetInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { session, ready } = useDealerSession();
  const [book, setBook] = useState<PricingBook | null>(null);
  const [showCost, setShowCost] = useState(false);
  const [showSuggested, setShowSuggested] = useState(false);

  const stored = typeof window !== "undefined" ? getSelectedVehicle() : null;
  const model = sp.get("model") || stored?.model || "";
  const year = Number(sp.get("year") || stored?.year || 0) || null;
  const trim = sp.get("trim") || stored?.trim || null;

  useEffect(() => {
    if (!ready) return;
    fetch("/api/pricing").then(async (r) => r.ok && setBook(await r.json()));
  }, [ready]);

  if (!ready || !session || !book) {
    return <div className="loading-stage"><div className="loading-text">Preparing sheet…</div></div>;
  }
  if (!model || !book.models.includes(model)) {
    return <div className="loading-stage"><div className="loading-text">Pick a vehicle first.</div></div>;
  }

  return (
    <>
      <style>{SHEET_PRINT_CSS}</style>
      <div className="no-print toolbar" style={{ padding: "18px 32px", borderBottom: "1px solid var(--stroke-soft)", marginBottom: 0 }}>
        <button className="reset" onClick={() => router.back()}>← BACK</button>
        <span className="grow" />
        {book.canSeeCost ? (
          <label className="check"><input type="checkbox" checked={showCost} onChange={(e) => setShowCost(e.target.checked)} /> Show WGA cost</label>
        ) : null}
        <label className="check"><input type="checkbox" checked={showSuggested} onChange={(e) => setShowSuggested(e.target.checked)} /> Show suggested</label>
        <button className="btn-primary btn-sm" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      <main style={{ padding: "40px 20px" }}>
        <VehicleSheet book={book} model={model} year={year} trim={trim} dealership={session.dealership.name} logo={session.brand?.logo_url} brandName={session.brand?.name} showCost={showCost && book.canSeeCost} showSuggested={showSuggested} />
      </main>
    </>
  );
}

export default function SheetPage() {
  return (
    <div className="frame">
      <Suspense fallback={<div className="loading-stage"><div className="loading-text">Preparing sheet…</div></div>}>
        <SheetInner />
      </Suspense>
    </div>
  );
}
