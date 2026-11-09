"use client";

import OrderActivity from "@/components/OrderActivity";
import QuoteDocument from "@/components/QuoteDocument";
import type { PacketData } from "@/lib/packet";
import OrderTimeline from "@/components/OrderTimeline";

import Link from "next/link";

import { Suspense, useCallback, useEffect, useState } from "react";
import { cleanChange, cleanVin } from "@/lib/caret";
import { useParams, useRouter, useSearchParams } from "next/navigation";

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
  available_from?: string | null;
  needed_by?: string | null;
  sm_order_number?: string | null;
  package_tier: string | null;
  package_snapshot: any;
  tint_upgrade: boolean;
  alacarte_items: any[];
  line_items: { item_id?: string; service: string; name: string; retail: number }[];
  retail_total: number;
  status: string;
  created_at: string;
  notes?: string | null;
}

const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

// Saved quote → order: VIN + dates, then send it to White Glove Auto (same checks as the pricing page).
function SubmitSavedQuote({ id, quote, onDone }: { id: string; quote: QuoteData; onDone: () => void }) {
  const router = useRouter();
  const [vin, setVin] = useState(quote.vehicle_vin || "");
  const [availableFrom, setAvailableFrom] = useState(quote.available_from || "");
  const [neededBy, setNeededBy] = useState(quote.needed_by || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [needsEdit, setNeedsEdit] = useState(false);
  const [dup, setDup] = useState<any>(null);
  const [repriced, setRepriced] = useState<any>(null);
  const vinOk = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
  const today = new Date().toISOString().slice(0, 10);

  async function submit(opts: { confirmDuplicate?: boolean; confirmPrice?: boolean } = {}) {
    if (!vinOk) {
      setErr(vin ? `That VIN has ${vin.length} characters — it needs 17 (no I, O or Q).` : "Enter the VIN to submit the order.");
      document.getElementById("sq-vin")?.focus();
      return;
    }
    setBusy(true);
    setErr("");
    setNeedsEdit(false);
    const res = await fetch(`/api/quotes/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vin, availableFrom, neededBy, confirmDuplicate: !!opts.confirmDuplicate, confirmPrice: !!opts.confirmPrice }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409 && d.duplicate) { setDup(d.duplicate); setRepriced(null); return; }
    if (res.status === 409 && d.repriced) { setRepriced({ ...d.repriced, confirmDuplicate: !!opts.confirmDuplicate }); setDup(null); return; }
    if (res.status === 409 && d.alreadySubmitted) { onDone(); return; }
    if (!res.ok) { setErr(d.error || "Could not submit."); setNeedsEdit(!!d.needsEdit); return; }
    router.replace(`/portal/quote/${id}?sent=1`);
    onDone();
  }

  return (
    <div className="card submit-saved no-print">
      <div className="ss-head">
        <div>
          <div className="stage-eyebrow">SAVED QUOTE · NOT SENT YET</div>
          <div className="ss-title">Ready to order? Add the VIN and submit it for install.</div>
        </div>
        <Link href={`/portal/pricing?quote=${id}`} className="btn-ghost btn-sm" style={{ display: "inline-block", textDecoration: "none" }}>Edit quote</Link>
      </div>
      <div className="ss-fields">
        <div className="field ss-vin">
          <label htmlFor="sq-vin">VIN {vin ? <span style={{ color: vinOk ? "var(--gold)" : "var(--text-3)", letterSpacing: 0, textTransform: "none" }}>· {vinOk ? "✓" : `${vin.length}/17`}</span> : null}</label>
          <input id="sq-vin" value={vin} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="vin-input" onChange={(e) => cleanChange(e, cleanVin, setVin)} placeholder="17 characters — required to submit" />
        </div>
        <div className="field"><label htmlFor="sq-avail">Vehicle available from</label><input id="sq-avail" type="date" value={availableFrom} min={today} onChange={(e) => setAvailableFrom(e.target.value)} /></div>
        <div className="field"><label htmlFor="sq-need">Needed back by</label><input id="sq-need" type="date" value={neededBy} min={availableFrom || today} onChange={(e) => setNeededBy(e.target.value)} /></div>
      </div>
      {dup ? (
        <div className="dup-warn" role="alert">
          <b>This car was already ordered.</b> Same VIN as order <b>{dup.quote_number}</b>{dup.ro ? ` (RO ${dup.ro})` : ""}, submitted {new Date(dup.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{dup.by ? ` by ${dup.by}` : ""} — {dup.services || "services on file"}.
          <div className="dup-actions">
            <Link href={`/portal/quote/${dup.id}`} className="btn-ghost btn-sm" style={{ display: "inline-block" }}>Open {dup.quote_number}</Link>
            <button className="btn-primary btn-sm" disabled={busy} onClick={() => submit({ confirmDuplicate: true })}>Submit anyway</button>
            <button className="link-btn" onClick={() => setDup(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      {repriced ? (
        <div className="dup-warn" role="alert">
          <b>Prices changed since this quote was saved.</b> Customer price {money(repriced.retail.was)} → <b>{money(repriced.retail.now)}</b>
          {repriced.cost ? <> · your cost {money(repriced.cost.was)} → <b>{money(repriced.cost.now)}</b></> : null}
          {repriced.dropped ? <> · a service on this quote is no longer offered</> : null}.
          <div className="dup-actions">
            <button className="btn-primary btn-sm" disabled={busy} onClick={() => submit({ confirmPrice: true, confirmDuplicate: repriced.confirmDuplicate })}>Submit at the new price</button>
            <Link href={`/portal/pricing?quote=${id}`} className="btn-ghost btn-sm" style={{ display: "inline-block" }}>Edit quote</Link>
            <button className="link-btn" onClick={() => setRepriced(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      {err ? <div className="ss-err" role="alert">{err} {needsEdit ? <Link href={`/portal/pricing?quote=${id}`}>Edit quote</Link> : null}</div> : null}
      <div className="ss-actions">
        <button className="btn-primary" disabled={busy} onClick={() => submit()}>{busy ? "Sending…" : "Submit order"}</button>
      </div>
    </div>
  );
}

function QuoteSheetInner() {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();
  const justSent = sp.get("sent") === "1";
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [dealership, setDealership] = useState<{ name: string } | null>(null);
  const [brand, setBrand] = useState<{ name: string; logo_url: string } | null>(null);
  const [doc, setDoc] = useState<PacketData | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/quotes/${params.id}`);
    if (!res.ok) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const [data, pk] = await Promise.all([res.json(), fetch(`/api/quotes/${params.id}/packet`).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
    if (pk?.data) {
      setDoc(pk.data);
      setShareUrl(pk.shareUrl || null);
    }
    setQuote(data.quote);
    setEvents(data.events || []);
    setDealership(data.dealership);
    setBrand(data.brand || null);
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

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

  const shareMsg = `Here's the XPEL protection quote for your ${quote.vehicle_year} ${quote.vehicle_model}: ${shareUrl}`;
  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

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
            padding: "14px 20px",
            gap: 10,
            flexWrap: "wrap",
            borderBottom: "1px solid var(--stroke-soft)",
          }}
        >
          <button className="reset" onClick={() => router.push("/portal/orders")}>
            ← BACK
          </button>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-primary" onClick={() => window.print()}>
              Print / Save PDF
            </button>
            {shareUrl ? (
              <>
                <a className="btn-ghost" style={{ textDecoration: "none" }} href={`sms:?&body=${encodeURIComponent(shareMsg)}`}>Text to customer</a>
                <button className="btn-ghost" onClick={copyLink}>{copied ? "Link copied ✓" : "Copy customer link"}</button>
              </>
            ) : null}
          </div>
        </div>

        {justSent ? (
          <div className="no-print" style={{ padding: "16px 20px 0", maxWidth: 820, margin: "0 auto" }}>
            <div className="notice ok" style={{ marginBottom: 0 }}>Order <b>{quote.quote_number}</b> is on its way to White Glove Auto{quote.sm_order_number ? <> — ticket <b>RO {quote.sm_order_number}</b> is already open</> : null}. Photos and status updates will show up at the bottom of this page.</div>
          </div>
        ) : null}
        {quote.status !== "draft" && (quote.available_from || quote.needed_by || quote.sm_order_number) ? (
          <div className="no-print internal-strip">
            <span className="lbl">Internal · not on the printed quote</span>
            {quote.available_from ? <span>Available from <b>{quote.available_from}</b></span> : null}
            {quote.needed_by ? <span>Needed back by <b>{quote.needed_by}</b></span> : null}
            {quote.sm_order_number ? <span>WGA ticket <b>RO {quote.sm_order_number}</b></span> : null}
          </div>
        ) : null}
        {quote.status === "draft" ? (
          <div className="no-print" style={{ padding: "16px 20px 0", maxWidth: 820, margin: "0 auto" }}>
            <SubmitSavedQuote id={String(params.id)} quote={quote} onDone={load} />
          </div>
        ) : null}
        <main style={{ display: "flex", justifyContent: "center", padding: "40px 20px" }}>
          {doc ? <QuoteDocument data={doc} status={quote.status} /> : <div className="loading-text">Loading document…</div>}
        </main>
        {quote.status !== "draft" ? (
          <section className="no-print" style={{ maxWidth: 780, margin: "0 auto", padding: "0 20px 48px" }}>
            <div className="stage-eyebrow" style={{ marginBottom: 10 }}>ORDER STATUS</div>
            <OrderTimeline quote={quote} events={events} />
            <div className="stage-eyebrow" style={{ margin: "22px 0 10px" }}>AFTER SUBMITTING</div>
            <OrderActivity quoteId={String(params.id)} side="dealer" />
          </section>
        ) : null}
      </div>
    </>
  );
}

export default function QuoteSheetPage() {
  return (
    <Suspense fallback={null}>
      <QuoteSheetInner />
    </Suspense>
  );
}
