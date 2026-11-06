"use client";

import { useState } from "react";
import { ZONES } from "./VehicleDiagram";
import type { PricingBook } from "@/lib/types";

// WGA admin: the words and coverage areas that appear on the customer packet.
// One block per service: product name, selling blurb, key facts, and per-package diagram zones.
export default function PacketEditor({ book, onService, onItem }: { book: PricingBook; onService: (id: string, patch: any) => Promise<void>; onItem: (id: string, patch: any) => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ marginTop: 40 }}>
      <div className="stage-head" style={{ marginBottom: 14 }}>
        <div className="stage-eyebrow">CUSTOMER PACKET</div>
        <div className="stage-title" style={{ fontSize: 28 }}>What the customer reads.</div>
        <div className="stage-sub">Dealers can print or text a branded proposal for any quote. This is the copy on it — product name, the pitch, the key facts — and which areas of the vehicle each package lights up on the diagram.</div>
      </div>
      {book.services.map((svc) => (
        <div key={svc.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setOpen(open === svc.id ? null : svc.id)}>
            <h3 style={{ margin: 0 }}>{svc.name} <span style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "0.12em", marginLeft: 8 }}>{svc.product_name || "— no product name yet"}</span></h3>
            <span style={{ color: "var(--text-3)" }}>{open === svc.id ? "▴" : "▾"}</span>
          </div>
          {open === svc.id ? (
            <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
              <div className="field"><label>Product name (as printed)</label><input defaultValue={svc.product_name || ""} placeholder="XPEL ULTIMATE PLUS™" onBlur={(e) => e.target.value !== (svc.product_name || "") && onService(svc.id, { product_name: e.target.value })} /></div>
              <div className="field"><label>The pitch (2–3 sentences)</label><textarea rows={3} defaultValue={svc.blurb || ""} onBlur={(e) => e.target.value !== (svc.blurb || "") && onService(svc.id, { blurb: e.target.value })} style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13, lineHeight: 1.6 }} /></div>
              <div className="field"><label>Key facts — one per line</label><textarea rows={5} defaultValue={(svc.facts || []).join("\n")} onBlur={(e) => e.target.value !== (svc.facts || []).join("\n") && onService(svc.id, { facts: e.target.value })} style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)", padding: 10, fontFamily: "inherit", fontSize: 13, lineHeight: 1.6 }} /></div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>Coverage on the diagram, per package</div>
                {svc.items.filter((i) => i.active).map((it) => (
                  <div key={it.id} style={{ padding: "12px 0", borderTop: "1px solid var(--stroke-soft)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <b>{it.name}</b>
                      <input placeholder="Short description on the packet (optional)" defaultValue={it.description || ""} onBlur={(e) => e.target.value !== (it.description || "") && onItem(it.id, { description: e.target.value })} style={{ flex: 1, minWidth: 200, background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)", padding: "6px 10px", fontSize: 12 }} />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {ZONES.map((z) => {
                        const on = (it.zones || []).includes(z.id);
                        return (
                          <button key={z.id} className={"pkg-chip " + (on ? "sel" : "")} onClick={() => onItem(it.id, { zones: on ? (it.zones || []).filter((x) => x !== z.id) : [...(it.zones || []), z.id] })}>
                            {z.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
