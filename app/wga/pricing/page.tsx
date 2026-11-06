"use client";

import { useEffect, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import PriceGrid, { type GridChange } from "@/components/PriceGrid";
import PacketEditor from "@/components/PacketEditor";
import { useWgaSession } from "@/lib/useDealerSession";
import type { PricingBook } from "@/lib/types";

// WGA admin: every service, every package, every model — cost + suggested retail.
export default function WgaPricingPage() {
  const { session, ready } = useWgaSession();
  const [book, setBook] = useState<PricingBook | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [newSvc, setNewSvc] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/wga/pricing");
    if (r.ok) setBook(await r.json());
  }
  useEffect(() => {
    if (ready) load();
  }, [ready]);

  async function savePricing(changes: GridChange[]) {
    const res = await fetch("/api/wga/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cells: changes.map((c) => ({
          model: c.model,
          item_id: c.item_id,
          cost: c.cost === undefined ? book?.prices[c.model]?.[c.item_id]?.cost ?? null : c.cost,
          suggested_retail: c.suggested_retail === undefined ? book?.prices[c.model]?.[c.item_id]?.suggested_retail ?? null : c.suggested_retail,
        })),
      }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Save failed");
    // keep local book in sync for later partial saves
    setBook((b) => {
      if (!b) return b;
      const copy = { ...b, prices: { ...b.prices } };
      for (const c of changes) {
        copy.prices[c.model] = { ...copy.prices[c.model] };
        const cell = { ...copy.prices[c.model][c.item_id] };
        if (c.cost !== undefined) cell.cost = c.cost ?? null;
        if (c.suggested_retail !== undefined) cell.suggested_retail = c.suggested_retail ?? null;
        copy.prices[c.model][c.item_id] = cell;
      }
      return copy;
    });
  }

  async function svcAction(body: any) {
    setMsg("");
    const res = await fetch("/api/wga/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) {
      setMsg(d.error || "Failed");
      return;
    }
    await load();
  }

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  if (session.user.role !== "admin") {
    return (
      <div className="frame">
        <WgaHeader userName={session.user.name} role={session.user.role} />
        <main><div className="stage"><div className="notice warn">Pricing is editable by WGA admins only.</div></div></main>
      </div>
    );
  }

  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} />
      <main>
        <div className="stage" style={{ maxWidth: 1240 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">{(book?.dealership?.name || "DEALER").toUpperCase()} · DEALER PRICING</div>
            <div className="stage-title">What we charge the dealership.</div>
            <div className="stage-sub">
              One price per model. <b>WGA cost</b> is what White Glove Auto bills the dealer. <b>Suggested retail</b> is their starting customer price (they can override it). Changes save automatically and show in the dealer portal immediately.
            </div>
          </div>

          <div className="toolbar">
            <label className="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show hidden packages</label>
            <span className="grow" />
            <input className="field" style={{ background: "var(--surface)", border: "1px solid var(--stroke)", color: "var(--text)", padding: "10px 14px", fontSize: 12, minWidth: 220 }} placeholder="New service name (e.g. Interior Protection)" value={newSvc} onChange={(e) => setNewSvc(e.target.value)} />
            <button className="btn-ghost btn-sm" disabled={!newSvc.trim()} onClick={() => { svcAction({ action: "service.create", name: newSvc.trim() }); setNewSvc(""); }}>+ Add service</button>
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}

          {book ? (
            <>
              <PriceGrid
                book={book}
                mode="wga"
                showInactive={showInactive}
                onSave={savePricing}
                onRenameItem={(id, name) => svcAction({ action: "item.update", id, name })}
                onAddItem={(service_id) => svcAction({ action: "item.create", service_id, name: "New package" })}
                onToggleItem={(id, active) => svcAction({ action: "item.update", id, active })}
                onRemoveItem={(id) => svcAction({ action: "item.delete", id })}
                onUpdateService={(id, patch) => svcAction({ action: "service.update", id, ...patch })}
                onMove={(kind, id, dir) => svcAction({ action: kind === "service" ? "service.move" : "item.move", id, dir })}
              />
              <PacketEditor book={book} onService={(id, patch) => svcAction({ action: "service.update", id, ...patch })} onItem={(id, patch) => svcAction({ action: "item.update", id, ...patch })} />
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
