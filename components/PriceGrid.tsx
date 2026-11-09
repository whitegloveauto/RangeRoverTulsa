"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { PricingBook } from "@/lib/types";
import { cleanChange } from "@/lib/caret";

// Editable per-model price grid.
//  mode "wga":    edits cost + suggested retail (WGA admin). Can rename/add/remove packages.
//  mode "dealer": edits the dealership's own retail; shows WGA cost + suggested read-only.
//
// Typing has to feel like a plain text box, so:
//  - each price box owns what's on screen while it has focus; nothing from the server
//    ever overwrites a box someone is typing in
//  - edits that haven't been confirmed by the server survive any reload of the book
//  - saves are debounced, sent one at a time (never out of order), carry the whole cell,
//    and flush immediately when you leave a box
//  - a keystroke only re-renders the box being typed in, not the whole grid

type Cell = { cost: number | null; suggested_retail: number | null; retail: number | null };
export type GridChange = { model: string; item_id: string } & Partial<Cell>;
type Field = keyof Cell;
type Book = Record<string, Record<string, Cell>>;

const EMPTY: Cell = { cost: null, suggested_retail: null, retail: null };
const SEP = "\u0001";
const fmt = (v: number | null | undefined) => (v === null || v === undefined ? "" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const cleanMoney = (s: string) => {
  const t = s.replace(/[^0-9.]/g, "");
  const i = t.indexOf(".");
  return (i === -1 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "").slice(0, 2)).slice(0, 9);
};
const parse = (s: string): number | null => (s === "" || s === "." ? null : Number(s));
function fromBook(book: PricingBook): Book {
  const out: Book = {};
  for (const m of book.models) {
    out[m] = {};
    for (const k of Object.keys(book.prices[m] || {})) out[m][k] = { ...book.prices[m][k] };
  }
  return out;
}

// One price box. While you type it shows exactly what you typed (cursor stays put);
// on blur it shows the formatted number. Server updates only land while it isn't focused.
const PriceInput = memo(function PriceInput({
  id,
  value,
  placeholder,
  edit,
  done,
  cellKey,
  field,
}: {
  id: string;
  value: number | null;
  placeholder: string;
  edit: (cellKey: string, field: Field, v: number | null) => void;
  done: () => void;
  cellKey: string;
  field: Field;
}) {
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  const justFocused = useRef(false);
  const keyedSinceFocus = useRef(false);
  const current = useRef<number | null>(value);
  useEffect(() => {
    if (!focused.current) {
      current.current = value;
      setText(fmt(value));
    }
  }, [value]);
  return (
    <input
      id={id}
      inputMode="decimal"
      enterKeyHint="next"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      value={text}
      onPointerDown={() => {
        if (!focused.current) justFocused.current = true; // this tap/click is what's focusing the box
      }}
      onFocus={(e) => {
        focused.current = true;
        keyedSinceFocus.current = false;
        // the text isn't touched on focus (changing it here races with taps, autofill and paste);
        // the first edit drops the commas and blur puts them back
        // Keyboard focus (Tab / Next): select the number right away so typing replaces it.
        // Tap/click focus: select on release instead (the press would otherwise drop a cursor and undo it).
        if (!justFocused.current) {
          const el = e.target;
          setTimeout(() => {
            if (document.activeElement === el && !keyedSinceFocus.current) el.select();
          }, 0);
        }
      }}
      onMouseUp={(e) => {
        if (!justFocused.current) return;
        justFocused.current = false;
        if (keyedSinceFocus.current) return;
        e.preventDefault();
        (e.target as HTMLInputElement).select(); // tap again to put the cursor somewhere instead
      }}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        cleanChange(e, cleanMoney, (t) => {
          keyedSinceFocus.current = true;
          setText(t);
          current.current = parse(t);
          edit(cellKey, field, current.current);
        })
      }
      onBlur={() => {
        focused.current = false;
        justFocused.current = false;
        setText(fmt(current.current));
        done();
      }}
      onKeyDown={(e) => {
        keyedSinceFocus.current = true;
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
});

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
  const local = useRef<Book | null>(null);
  if (local.current === null) local.current = fromBook(book); // first paint already has the numbers
  const [, setTick] = useState(0); // re-render after the book (server data) changes
  const [status, setStatusState] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });
  const setStatus = useCallback((text: string, kind: "" | "ok" | "err") => setStatusState((s) => (s.text === text && s.kind === kind ? s : { text, kind })), []);
  const pending = useRef<Set<string>>(new Set()); // cells edited since the last save went out
  const dirty = useRef<Set<string>>(new Set()); // cells whose typed value the server hasn't confirmed yet
  const saving = useRef(false);
  const timer = useRef<any>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  // Phones show one package column at a time (chips pick which); desktop shows them all.
  const [mobilePkg, setMobilePkg] = useState<Record<string, string>>({});

  // New server data: take it, except for cells with edits still on their way.
  useEffect(() => {
    const next = fromBook(book);
    for (const key of Array.from(dirty.current)) {
      const [m, k] = key.split(SEP);
      const mine = local.current?.[m]?.[k];
      if (mine) (next[m] = next[m] || {})[k] = { ...mine };
    }
    local.current = next;
    setTick((t) => t + 1);
  }, [book]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current || !pending.current.size) return;
    const keys = Array.from(pending.current);
    pending.current.clear();
    const sent = keys.map((key) => {
      const [model, item_id] = key.split(SEP);
      const c = local.current?.[model]?.[item_id] || EMPTY;
      return { model, item_id, cost: c.cost, suggested_retail: c.suggested_retail, retail: c.retail };
    });
    saving.current = true;
    setStatus("Saving…", "");
    let failed = false;
    try {
      await saveRef.current(sent);
      for (const s of sent) {
        const key = s.model + SEP + s.item_id;
        const c = local.current?.[s.model]?.[s.item_id];
        const unchanged = c && c.cost === s.cost && c.suggested_retail === s.suggested_retail && c.retail === s.retail;
        if (unchanged && !pending.current.has(key)) dirty.current.delete(key);
      }
    } catch (e: any) {
      failed = true;
      for (const k of keys) pending.current.add(k);
      setStatus(e?.message || "Save failed — edit again or tap away to retry.", "err");
    } finally {
      saving.current = false;
    }
    if (failed) return;
    if (pending.current.size) {
      setStatus("Unsaved changes…", "");
      timer.current = setTimeout(flush, 400); // edits made while that save was in flight
    } else setStatus("Saved", "ok");
  }, [setStatus]);

  const edit = useCallback(
    (cellKey: string, field: Field, v: number | null) => {
      const [m, k] = cellKey.split(SEP);
      const all = local.current || {};
      const cur = all[m]?.[k] || EMPTY;
      local.current = { ...all, [m]: { ...all[m], [k]: { ...cur, [field]: v } } };
      pending.current.add(cellKey);
      dirty.current.add(cellKey);
      setStatus("Unsaved changes…", "");
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 900);
    },
    [flush, setStatus]
  );

  // Leaving a box saves right away; so does switching apps / closing the tab.
  const done = useCallback(() => {
    if (pending.current.size) flush();
  }, [flush]);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && done();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      done();
    };
  }, [done]);

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
                      const c = local.current?.[model]?.[it.id] || EMPTY;
                      const id = `${model}-${it.id}`.replace(/\W+/g, "_");
                      const ck = model + SEP + it.id;
                      return (
                        <td key={it.id} className={"col" + ((mobilePkg[svc.id] ?? svc.items[0]?.id) === it.id ? " sel" : "")}>
                          <div className="pair">
                            {mode === "wga" ? (
                              <>
                                <label className="cost">
                                  <span className="cur">$</span>
                                  <PriceInput id={id + "-c"} value={c.cost} placeholder="—" cellKey={ck} field="cost" edit={edit} done={done} />
                                </label>
                                <label className="sugg">
                                  <span className="cur">$</span>
                                  <PriceInput id={id + "-s"} value={c.suggested_retail} placeholder="—" cellKey={ck} field="suggested_retail" edit={edit} done={done} />
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
                                  <PriceInput id={id + "-r"} value={c.retail} placeholder={fmt(c.suggested_retail) || "—"} cellKey={ck} field="retail" edit={edit} done={done} />
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
