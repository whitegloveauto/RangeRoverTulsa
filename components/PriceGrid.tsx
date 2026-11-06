"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PricingBook } from "@/lib/types";

// Editable per-model price grid.
//  mode "wga":    edits cost + suggested retail (WGA admin). Can rename/add/remove packages.
//  mode "dealer": edits the dealership's own retail; shows WGA cost + suggested read-only.
// Saves are debounced and sent as a batch of changed cells.

type Cell = { cost: number | null; suggested_retail: number | null; retail: number | null };
export type GridChange = { model: string; item_id: string } & Partial<Cell>;

export default function PriceGrid({
  book,
  mode,
  onSave,
  onRenameItem,
  onAddItem,
  onRemoveItem,
  onToggleItem,
  onUpdateService,
  onMove,
  showInactive,
}: {
  book: PricingBook;
  mode: "wga" | "dealer";
  onSave: (changes: GridChange[]) => Promise<void>;
  onRenameItem?: (itemId: string, name: string) => Promise<void>;
  onAddItem?: (serviceId: string) => Promise<void>;
  onRemoveItem?: (itemId: string) => Promise<void>;
  onToggleItem?: (itemId: string, active: boolean) => Promise<void>;
  onUpdateService?: (serviceId: string, patch: { name?: string; note?: string; active?: boolean }) => Promise<void>;
  onMove?: (kind: "service" | "item", id: string, dir: -1 | 1) => Promise<void>;
  showInactive?: boolean;
}) {
  const [local, setLocal] = useState<Record<string, Record<string, Cell>>>({});
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });
  const pending = useRef<Map<string, GridChange>>(new Map());
  const timer = useRef<any>(null);
  // Phones show one package column at a time (chips pick which); desktop shows them all.
  const [mobilePkg, setMobilePkg] = useState<Record<string, string>>({});

  useEffect(() => {
    // Deep copy so inputs are controlled from local state
    const copy: Record<string, Record<string, Cell>> = {};
    for (const m of book.models) {
      copy[m] = {};
      for (const k of Object.keys(book.prices[m] || {})) copy[m][k] = { ...book.prices[m][k] };
    }
    setLocal(copy);
  }, [book]);

  const fmt = (v: number | null) => (v === null || v === undefined ? "" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }));
  const parse = (s: string): number | null => {
    const n = s.replace(/[^0-9.]/g, "");
    return n === "" ? null : Number(n);
  };

  function queue(model: string, itemId: string, field: keyof Cell, value: number | null) {
    setLocal((cur) => ({ ...cur, [model]: { ...cur[model], [itemId]: { ...cur[model][itemId], [field]: value } } }));
    const key = model + "|" + itemId;
    const prev = pending.current.get(key) || { model, item_id: itemId };
    pending.current.set(key, { ...prev, [field]: value });
    setStatus({ text: "Unsaved changes…", kind: "" });
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }

  async function flush() {
    const changes = Array.from(pending.current.values());
    if (!changes.length) return;
    pending.current.clear();
    try {
      await onSave(changes);
      setStatus({ text: "Saved", kind: "ok" });
    } catch (e: any) {
      setStatus({ text: e?.message || "Save failed — edit again to retry.", kind: "err" });
      for (const c of changes) pending.current.set(c.model + "|" + c.item_id, c);
    }
  }

  const services = useMemo(
    () => book.services.map((s) => ({ ...s, items: s.items.filter((i) => showInactive || i.active) })),
    [book, showInactive]
  );

  return (
    <div>
      <div className="toolbar">
        <span className="grow" />
        <span className={"status " + status.kind}>{status.text}</span>
      </div>
      {services.map((svc) => (
        <div key={svc.id}>
          <div className="svc-editor-head">
            {mode === "wga" && onUpdateService ? (
              <>
                <input className="title" defaultValue={svc.name} aria-label="Service name" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== svc.name) onUpdateService(svc.id, { name: v }); }} />
                <input className="note" placeholder="NOTE (FILM LINE, WARRANTY…)" defaultValue={svc.note || ""} aria-label="Service note" onBlur={(e) => { if ((e.target.value || "") !== (svc.note || "")) onUpdateService(svc.id, { note: e.target.value }); }} />
                {onMove ? (
                  <span className="move-btns">
                    <button className="link-btn" title="Move service up" onClick={() => onMove("service", svc.id, -1)}>▲</button>
                    <button className="link-btn" title="Move service down" onClick={() => onMove("service", svc.id, 1)}>▼</button>
                  </span>
                ) : null}
                <button className="link-btn" onClick={() => onUpdateService(svc.id, { active: !svc.active })}>{svc.active ? "hide service" : "show service"}</button>
              </>
            ) : (
              <>
                <span className="svc-title">{svc.name}</span>
                {svc.note ? <span className="svc-note">{svc.note}</span> : null}
              </>
            )}
            {!svc.active ? <span className="inactive-tag">Hidden from dealers</span> : null}
            {mode === "wga" && onAddItem ? (
              <button className="btn-ghost btn-sm" onClick={() => onAddItem(svc.id)}>
                + Add package
              </button>
            ) : null}
          </div>
          {svc.items.length > 1 ? (
            <div className="pkg-chips">
              {svc.items.map((it, i) => {
                const sel = (mobilePkg[svc.id] ?? svc.items[0].id) === it.id;
                return (
                  <button key={it.id} className={sel ? "sel" : ""} onClick={() => setMobilePkg((m) => ({ ...m, [svc.id]: it.id }))}>
                    {it.name}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="grid-wrap">
            <table className="pgrid">
              <thead>
                <tr>
                  <th className="model">Model</th>
                  {svc.items.map((it) => (
                    <th key={it.id} className={"pkg col" + ((mobilePkg[svc.id] ?? svc.items[0]?.id) === it.id ? " sel" : "")}>
                      {mode === "wga" && onRenameItem ? (
                        <div className="pkg-edit">
                          <input
                            defaultValue={it.name}
                            aria-label="Package name"
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v && v !== it.name) onRenameItem(it.id, v);
                            }}
                          />
                          {onMove ? (
                            <span className="move-btns">
                              <button className="link-btn" title="Move left" onClick={() => onMove("item", it.id, -1)}>◀</button>
                              <button className="link-btn" title="Move right" onClick={() => onMove("item", it.id, 1)}>▶</button>
                            </span>
                          ) : null}
                          {onToggleItem ? (
                            <button className="link-btn" title={it.active ? "Hide from dealers" : "Show to dealers"} onClick={() => onToggleItem(it.id, !it.active)}>
                              {it.active ? "hide" : "show"}
                            </button>
                          ) : null}
                          {onRemoveItem ? (
                            <button className="link-btn danger" title="Delete this package and its pricing" onClick={() => onRemoveItem(it.id)}>
                              ✕
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span>{it.name}</span>
                      )}
                      {!it.active ? <div><span className="inactive-tag">hidden</span></div> : null}
                      <div className="sub">
                        {mode === "wga" ? (
                          <>
                            <span>WGA cost</span>
                            <span>Sugg. retail</span>
                          </>
                        ) : (
                          <>
                            {book.canSeeCost ? <span>WGA cost</span> : null}
                            <span>Suggested</span>
                            <span>Your price</span>
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {book.models.map((model) => (
                  <tr key={model}>
                    <td className="model">{model}</td>
                    {svc.items.map((it) => {
                      const c = local[model]?.[it.id] || { cost: null, suggested_retail: null, retail: null };
                      const id = `${model}-${it.id}`.replace(/\W+/g, "_");
                      return (
                        <td key={it.id} className={"col" + ((mobilePkg[svc.id] ?? svc.items[0]?.id) === it.id ? " sel" : "")}>
                          <div className="pair">
                            {mode === "wga" ? (
                              <>
                                <label className="cost">
                                  <span className="cur">$</span>
                                  <input id={id + "-c"} inputMode="numeric" placeholder="—" value={fmt(c.cost)} onChange={(e) => queue(model, it.id, "cost", parse(e.target.value))} />
                                </label>
                                <label className="sugg">
                                  <span className="cur">$</span>
                                  <input id={id + "-s"} inputMode="numeric" placeholder="—" value={fmt(c.suggested_retail)} onChange={(e) => queue(model, it.id, "suggested_retail", parse(e.target.value))} />
                                </label>
                              </>
                            ) : (
                              <>
                                {book.canSeeCost ? (
                                  <label className="sugg">
                                    <span className="cur">$</span>
                                    <input readOnly value={fmt(c.cost)} placeholder="—" tabIndex={-1} />
                                  </label>
                                ) : null}
                                <label className="sugg">
                                  <span className="cur">$</span>
                                  <input readOnly value={fmt(c.suggested_retail)} placeholder="—" tabIndex={-1} />
                                </label>
                                <label className="cost">
                                  <span className="cur">$</span>
                                  <input id={id + "-r"} inputMode="numeric" placeholder={fmt(c.suggested_retail) || "—"} value={fmt(c.retail)} onChange={(e) => queue(model, it.id, "retail", parse(e.target.value))} />
                                </label>
                              </>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    {svc.items.length === 0 ? <td className="ro">No packages yet.</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
