"use client";

import { useEffect, useMemo, useState } from "react";
import type { PricingBook } from "@/lib/types";
import { previewRecipe, type SmRecipe, type SmRecipeLine } from "@/lib/smRecipeShared";

// WGA admin: how each package is built on the ShopMonkey RO — its labor and material lines.
// Internal to White Glove; nothing here is ever shown to a dealership.

type Rate = { name: string; rate: number };
type Draft = { kind: "labor" | "material"; name: string; qty: string; price: string; cost: string; part_number: string; balance: boolean };

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const toDraft = (l: SmRecipeLine): Draft => ({ kind: l.kind, name: l.name, qty: String(l.qty), price: l.price === null || l.price === undefined ? "" : String(l.price), cost: l.cost === null || l.cost === undefined ? "" : String(l.cost), part_number: l.part_number || "", balance: !!l.balance });
const fromDraft = (d: Draft): SmRecipeLine => ({ kind: d.kind, name: d.name.trim(), qty: Number(d.qty), price: d.balance || d.price.trim() === "" ? null : Number(d.price), cost: d.cost.trim() === "" ? null : Number(d.cost), part_number: d.part_number.trim() || null, balance: d.balance });
const summary = (r: SmRecipe | undefined) => {
  if (!r?.lines?.length) return "No build yet — goes on the ticket as one line at the dealer price";
  const lab = r.lines.filter((l) => l.kind === "labor");
  const mat = r.lines.filter((l) => l.kind === "material");
  const hours = lab.reduce((s, l) => s + l.qty, 0);
  return [lab.length ? `${lab.length} labor line${lab.length > 1 ? "s" : ""} (${hours} hr)` : "", mat.length ? `${mat.length} material line${mat.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
};

const inputStyle: React.CSSProperties = { width: "100%", background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)", padding: "8px 10px", fontFamily: "inherit", fontSize: 13 };
const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)", fontWeight: 500, padding: "0 8px 6px 0", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "4px 8px 4px 0", verticalAlign: "middle" };

export default function TicketBuilds({ book }: { book: PricingBook }) {
  const [recipes, setRecipes] = useState<Record<string, SmRecipe>>({});
  const [rates, setRates] = useState<Rate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openSvc, setOpenSvc] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // item id
  const [draft, setDraft] = useState<Draft[]>([]);
  const [everywhere, setEverywhere] = useState(true);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);

  useEffect(() => {
    fetch("/api/wga/recipes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setRecipes(d.recipes || {});
          setRates(d.rates || []);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const defaultRate = rates[0]?.rate ?? 130;
  const built = useMemo(() => book.services.reduce((n, s) => n + s.items.filter((i) => recipes[i.id]?.lines?.length).length, 0), [book, recipes]);
  const total = useMemo(() => book.services.reduce((n, s) => n + s.items.filter((i) => i.active).length, 0), [book]);

  function start(itemId: string, svcName: string) {
    const r = recipes[itemId];
    setDraft(
      r?.lines?.length
        ? r.lines.map(toDraft)
        : [
            { kind: "material", name: svcName.replace(/\s+/g, " ").trim(), qty: "1", price: "", cost: "", part_number: "", balance: true },
            { kind: "labor", name: "Install Labor", qty: "", price: "", cost: "", part_number: "", balance: false },
          ]
    );
    setEverywhere(true);
    setMsg(null);
    setEditing(itemId);
    const priced = book.models.find((m) => book.prices[m]?.[itemId]?.cost != null);
    setModel(priced || book.models[0] || "");
  }
  const patch = (i: number, p: Partial<Draft>) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const setBalance = (i: number) => setDraft((d) => d.map((l, j) => ({ ...l, balance: j === i })));

  async function save(itemId: string, lines: Draft[]) {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/wga/recipes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: itemId, lines: lines.map(fromDraft), everywhere }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: d.error || "Could not save the build.", kind: "err" });
      return;
    }
    const fresh = await fetch("/api/wga/recipes").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (fresh) setRecipes(fresh.recipes || {});
    setEditing(null);
    setMsg({ text: lines.length ? `Build saved${d.applied > 1 ? ` for this package at ${d.applied} brands` : ""}. New orders use it from now on.` : "Build removed. New orders go back to one line at the dealer price.", kind: "ok" });
  }

  // Live preview of the build being edited
  const draftRecipe: SmRecipe | null = useMemo(() => {
    const lines = draft.filter((l) => l.name.trim() && Number(l.qty) > 0).map(fromDraft);
    return lines.length && lines.filter((l) => l.balance).length === 1 ? { lines } : null;
  }, [draft]);
  const priceOf = (m: string) => (editing ? book.prices[m]?.[editing]?.cost ?? null : null);
  const preview = draftRecipe && model && priceOf(model) != null ? previewRecipe(draftRecipe, Number(priceOf(model)), defaultRate) : null;
  const overModels = useMemo(() => (draftRecipe && editing ? book.models.filter((m) => priceOf(m) != null && previewRecipe(draftRecipe, Number(priceOf(m)), defaultRate).over > 0) : []), [draftRecipe, editing, book, defaultRate]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ marginTop: 40 }}>
      <div className="stage-head" style={{ marginBottom: 14 }}>
        <div className="stage-eyebrow">SHOPMONKEY TICKET BUILDS · INTERNAL</div>
        <div className="stage-title" style={{ fontSize: 28 }}>How each package lands on the RO.</div>
        <div className="stage-sub">
          Give a package its labor and material lines and every order for it builds the ShopMonkey service that way. One line absorbs the difference, so the service always totals what we bill the dealer for that model. Dealerships never see any of this.
          {loaded ? <> <b>{built} of {total}</b> packages have a build.</> : null}
        </div>
      </div>
      {msg ? <div className={"notice" + (msg.kind === "err" ? " warn" : "")}>{msg.text}</div> : null}

      {book.services.map((svc) => {
        const items = svc.items.filter((i) => i.active);
        if (!items.length) return null;
        const n = items.filter((i) => recipes[i.id]?.lines?.length).length;
        return (
          <div key={svc.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setOpenSvc(openSvc === svc.id ? null : svc.id)}>
              <h3 style={{ margin: 0 }}>
                {svc.name.replace(/\s+/g, " ")} <span style={{ fontSize: 11, color: n ? "var(--gold)" : "var(--text-3)", letterSpacing: "0.12em", marginLeft: 8 }}>{n} OF {items.length} BUILT</span>
              </h3>
              <span style={{ color: "var(--text-3)" }}>{openSvc === svc.id ? "▴" : "▾"}</span>
            </div>
            {openSvc === svc.id
              ? items.map((it) => (
                  <div key={it.id} style={{ padding: "14px 0 4px", marginTop: 12, borderTop: "1px solid var(--stroke-soft)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <b>{it.name}</b>
                        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{summary(recipes[it.id])}</div>
                      </div>
                      {editing === it.id ? null : (
                        <button className="btn-ghost btn-sm" onClick={() => start(it.id, svc.product_name || svc.name)}>
                          {recipes[it.id]?.lines?.length ? "Edit build" : "Set up build"}
                        </button>
                      )}
                    </div>

                    {editing === it.id ? (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                            <thead>
                              <tr>
                                <th style={th}>Type</th>
                                <th style={{ ...th, width: "30%" }}>Line name</th>
                                <th style={th}>Hours / Qty</th>
                                <th style={th}>Rate / Price each</th>
                                <th style={th}>Part #</th>
                                <th style={th}>Our cost each</th>
                                <th style={th} title="This line is priced at whatever is left, so the service totals the dealer price">Absorbs the difference</th>
                                <th style={th}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {draft.map((l, i) => (
                                <tr key={i}>
                                  <td style={td}>
                                    <select style={{ ...inputStyle, minWidth: 108 }} value={l.kind} aria-label="Line type" onChange={(e) => patch(i, { kind: e.target.value as Draft["kind"] })}>
                                      <option value="material">Material</option>
                                      <option value="labor">Labor</option>
                                    </select>
                                  </td>
                                  <td style={td}>
                                    <input style={inputStyle} value={l.name} aria-label="Line name" placeholder={l.kind === "labor" ? "Install Labor" : "XPEL Ultimate Plus 8"} onChange={(e) => patch(i, { name: e.target.value })} />
                                  </td>
                                  <td style={td}>
                                    <input style={{ ...inputStyle, width: 90 }} value={l.qty} inputMode="decimal" aria-label={l.kind === "labor" ? "Hours" : "Quantity"} placeholder={l.kind === "labor" ? "hrs" : "qty"} onChange={(e) => patch(i, { qty: e.target.value.replace(/[^\d.]/g, "") })} />
                                  </td>
                                  <td style={td}>
                                    {l.balance ? (
                                      <span style={{ fontSize: 12, color: "var(--gold)" }}>whatever is left</span>
                                    ) : l.kind === "labor" ? (
                                      <span style={{ display: "flex", gap: 6 }}>
                                        <select
                                          style={{ ...inputStyle, minWidth: 170 }}
                                          aria-label="Labor rate"
                                          value={l.price === "" ? "" : rates.some((r) => String(r.rate) === l.price) ? l.price : "custom"}
                                          onChange={(e) => patch(i, { price: e.target.value === "custom" ? (l.price && !rates.some((r) => String(r.rate) === l.price) ? l.price : "0") : e.target.value })}
                                        >
                                          <option value="">Shop default rate</option>
                                          {rates.map((r) => (
                                            <option key={r.name} value={String(r.rate)}>{r.name} · ${r.rate}/hr</option>
                                          ))}
                                          <option value="custom">Custom rate…</option>
                                        </select>
                                        {l.price !== "" && !rates.some((r) => String(r.rate) === l.price) ? (
                                          <input style={{ ...inputStyle, width: 90 }} value={l.price} inputMode="decimal" aria-label="Custom rate per hour" placeholder="$/hr" onChange={(e) => patch(i, { price: e.target.value.replace(/[^\d.]/g, "") })} />
                                        ) : null}
                                      </span>
                                    ) : (
                                      <input style={{ ...inputStyle, width: 110 }} value={l.price} inputMode="decimal" aria-label="Price each" placeholder="$ each" onChange={(e) => patch(i, { price: e.target.value.replace(/[^\d.]/g, "") })} />
                                    )}
                                  </td>
                                  <td style={td}>
                                    {l.kind === "material" ? <input style={{ ...inputStyle, width: 110 }} value={l.part_number} aria-label="Part number" placeholder="optional" onChange={(e) => patch(i, { part_number: e.target.value })} /> : null}
                                  </td>
                                  <td style={td}>
                                    {l.kind === "material" ? <input style={{ ...inputStyle, width: 100 }} value={l.cost} inputMode="decimal" aria-label="Our cost each" placeholder="optional" onChange={(e) => patch(i, { cost: e.target.value.replace(/[^\d.]/g, "") })} /> : null}
                                  </td>
                                  <td style={{ ...td, textAlign: "center" }}>
                                    <input type="radio" name={`bal-${it.id}`} checked={l.balance} aria-label={`${l.name || "This line"} absorbs the difference`} onChange={() => setBalance(i)} />
                                  </td>
                                  <td style={td}>
                                    <button className="link-btn danger" title="Remove this line" onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>✕</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                          <button className="btn-ghost btn-sm" onClick={() => setDraft((d) => [...d, { kind: "material", name: "", qty: "1", price: "0", cost: "", part_number: "", balance: !d.some((x) => x.balance) }])}>+ Material line</button>
                          <button className="btn-ghost btn-sm" onClick={() => setDraft((d) => [...d, { kind: "labor", name: "", qty: "", price: "", cost: "", part_number: "", balance: false }])}>+ Labor line</button>
                        </div>

                        {/* How it lands on a real price */}
                        <div style={{ marginTop: 18, padding: "14px 16px", background: "var(--bg)", border: "1px solid var(--stroke-soft)" }}>
                          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                            <span style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-3)" }}>Preview on</span>
                            <select style={{ ...inputStyle, width: "auto", minWidth: 200 }} value={model} aria-label="Preview model" onChange={(e) => setModel(e.target.value)}>
                              {book.models.map((m) => (
                                <option key={m} value={m}>{m}{priceOf(m) == null ? " (not priced)" : ""}</option>
                              ))}
                            </select>
                            {priceOf(model) != null ? <span style={{ fontSize: 13 }}>We bill the dealer <b>{money(Number(priceOf(model)))}</b></span> : null}
                          </div>
                          {preview ? (
                            <>
                              {preview.lines.map((l, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "3px 0" }}>
                                  <span>
                                    <span style={{ color: "var(--text-3)", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.12em", marginRight: 8 }}>{l.kind}</span>
                                    {l.name} · {l.qty} {l.kind === "labor" ? "hr" : "×"} {money(l.unit)}
                                    {l.balance ? <span style={{ color: "var(--gold)", marginLeft: 8, fontSize: 11 }}>absorbs the difference</span> : null}
                                  </span>
                                  <span>{money(l.total)}</span>
                                </div>
                              ))}
                              {preview.discount > 0 ? (
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0", color: "var(--text-2)" }}>
                                  <span>Discount on the service{preview.over > 0 ? " (fixed lines are more than the dealer price)" : " (rounding)"}</span>
                                  <span>−{money(preview.discount)}</span>
                                </div>
                              ) : null}
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0 0", marginTop: 6, borderTop: "1px solid var(--stroke-soft)", fontWeight: 600 }}>
                                <span>Service total on the RO</span>
                                <span>{money(Number(priceOf(model)))}</span>
                              </div>
                            </>
                          ) : (
                            <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                              {priceOf(model) == null ? "This model has no dealer price for this package yet — pick a priced model to preview." : "Fill in each line's name and hours or quantity, and pick the one line that absorbs the difference."}
                            </div>
                          )}
                          {overModels.length ? (
                            <div style={{ fontSize: 12, color: "var(--gold)", marginTop: 10, lineHeight: 1.5 }}>
                              On {overModels.length} model{overModels.length > 1 ? "s" : ""} ({overModels.slice(0, 4).join(", ")}{overModels.length > 4 ? "…" : ""}) the fixed lines add up to more than the dealer price. Those tickets still total the dealer price — the difference shows as a discount on the service.
                            </div>
                          ) : null}
                          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 10, lineHeight: 1.5 }}>
                            Preview uses {money(defaultRate)}/hr for &ldquo;Shop default rate&rdquo;. The ticket itself uses whatever ShopMonkey applies and is checked against the dealer price after it&apos;s built.
                          </div>
                        </div>

                        <label className="check" style={{ marginTop: 14 }}>
                          <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} /> Use this build for &ldquo;{it.name}&rdquo; at every dealership brand (Range Rover, Porsche, Mercedes…)
                        </label>
                        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                          <button className="btn-primary btn-sm" disabled={busy || !draft.length} onClick={() => save(it.id, draft)}>{busy ? "Saving…" : "Save build"}</button>
                          <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                          {recipes[it.id]?.lines?.length ? (
                            <button className="btn-ghost btn-sm" disabled={busy} style={{ marginLeft: "auto" }} onClick={() => save(it.id, [])}>Remove build</button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              : null}
          </div>
        );
      })}
    </div>
  );
}
