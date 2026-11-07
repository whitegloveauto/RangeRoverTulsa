"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import CustomerPacket, { PACKET_CSS } from "@/components/CustomerPacket";
import type { PacketData } from "@/lib/packet";

// Dealer-side view of the customer packet with share / print tools.
export default function PacketPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<PacketData | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/quotes/${params.id}/packet`).then(async (r) => {
      const d = await r.json();
      if (!r.ok) return setErr(d.error || "Could not load packet.");
      setData(d.data);
      setShareUrl(d.shareUrl);
    });
  }, [params.id]);

  const title = data ? `${data.quote.vehicle_year} ${data.quote.vehicle_model} protection proposal` : "Protection proposal";
  const msg = data ? `Here's the XPEL protection proposal for your ${data.quote.vehicle_year} ${data.quote.vehicle_model}${data.quote.customer_name ? `, ${data.quote.customer_name.split(" ")[0]}` : ""}: ${shareUrl}` : "";

  async function share() {
    if (!shareUrl) return;
    if (navigator.share) {
      try { await navigator.share({ title, text: msg, url: shareUrl }); } catch {}
    } else copy();
  }
  async function copy() {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  }

  return (
    <div className="frame">
      <style dangerouslySetInnerHTML={{ __html: PACKET_CSS }} />
      <main style={{ padding: "0 12px 48px" }}>
        <div className="no-print" style={{ maxWidth: 820, margin: "0 auto", padding: "16px 0 18px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href={`/portal/quote/${params.id}`} className="btn-ghost btn-sm">← Back to quote</Link>
          <span style={{ flex: 1 }} />
          <button className="btn-ghost btn-sm" onClick={share} disabled={!shareUrl}>Share…</button>
          <a className="btn-ghost btn-sm" href={shareUrl ? `sms:?&body=${encodeURIComponent(msg)}` : "#"} aria-disabled={!shareUrl}>Text</a>
          <a className="btn-ghost btn-sm" href={shareUrl ? `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(msg)}` : "#"} aria-disabled={!shareUrl}>Email</a>
          <button className="btn-ghost btn-sm" onClick={copy} disabled={!shareUrl}>{copied ? "Copied ✓" : "Copy link"}</button>
          <button className="btn-primary btn-sm" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
        {err ? <div className="notice warn" style={{ maxWidth: 820, margin: "0 auto" }}>{err}</div> : null}
        {data ? <CustomerPacket data={data} /> : <div className="loading-stage"><div className="loading-text">Building packet…</div></div>}
        {shareUrl ? <p className="no-print" style={{ maxWidth: 820, margin: "14px auto 0", fontSize: 11, color: "var(--text-3)" }}>Customer link: <span style={{ color: "var(--text-2)", wordBreak: "break-all" }}>{shareUrl}</span> — opens without a login and always shows the current proposal.</p> : null}
      </main>
    </div>
  );
}
