"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { getSelectedVehicle, setSelectedVehicle } from "@/lib/vehicleStore";
import { useDealerSession } from "@/lib/useDealerSession";
import type { PricingBook } from "@/lib/types";
import { cleanChange, cleanVin } from "@/lib/caret";

const money = (n: number | null | undefined) => (n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));

export default function PricingPage() {
  const router = useRouter();
  const { session, ready } = useDealerSession();
  const [vehicle, setVehicle] = useState<{ year: number; model: string; trim: string } | null>(null);
  const [book, setBook] = useState<PricingBook | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [vin, setVin] = useState("");
  const [notes, setNotes] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean }>({ text: "" });
  const [dup, setDup] = useState<any>(null);
  // Editing a saved quote (/portal/pricing?quote=<id>): load it back in; Save/Submit update that quote.
  const [editId, setEditId] = useState<string | null>(null);
  const [editNumber, setEditNumber] = useState("");
  const [pendingItems, setPendingItems] = useState<string[] | null>(null);

  useEffect(() => {
    const qid = new URLSearchParams(window.location.search).get("quote");
    if (qid) {
      (async () => {
        const r = await fetch(`/api/quotes/${qid}`);
        const d = r.ok ? await r.json() : null;
        const q = d?.quote;
        if (!q || q.status !== "draft") {
          router.replace(q ? `/portal/quote/${qid}` : "/portal/orders");
          return;
        }
        const v = { year: Number(q.vehicle_year), model: q.vehicle_model, trim: q.vehicle_trim };
        setSelectedVehicle(v);
        setVehicle(v);
        setEditId(qid);
        setEditNumber(q.quote_number || "");
        setVin(q.vehicle_vin || "");
        setNotes(q.notes || "");
        setAvailableFrom(q.available_from || "");
        setNeededBy(q.needed_by || "");
        setPendingItems((Array.isArray(q.line_items) ? q.line_items : []).map((l: any) => l.item_id).filter(Boolean));
      })();
      return;
    }
    const v = getSelectedVehicle();
    if (!v) {
      router.replace("/portal/vehicle");
      return;
    }
    setVehicle(v);
  }, [router]);

  // Once the book is loaded, put the saved quote's choices back — one per category.
  useEffect(() => {
    if (!book || !pendingItems) return;
    const keep = new Set<string>();
    const doubled: string[] = [];
    const used = new Set<string>(); // pick-one groups already filled
    for (const svc of book.services) {
      const g = svc.group ? `g:${svc.group}` : `s:${svc.id}`;
      const picked = svc.items.filter((it) => pendingItems.includes(it.id));
      if (picked[0] && !used.has(g)) {
        keep.add(picked[0].id);
        used.add(g);
        if (picked.length > 1) doubled.push(svc.group || svc.name);
      } else if (picked[0]) doubled.push(svc.group || svc.name);
    }
    setSelected(keep);
    setPendingItems(null);
    if (doubled.length) setMsg({ text: `This quote had more than one option under ${Array.from(new Set(doubled)).join(" and ")}. Only one is allowed — check the one you want.`, err: true });
  }, [book, pendingItems]);

  useEffect(() => {
    if (!ready) return;
    fetch("/api/pricing").then(async (r) => r.ok && setBook(await r.json()));
  }, [ready]);

  const prices = useMemo(() => (book && vehicle ? book.prices[vehicle.model] || {} : {}), [book, vehicle]);

  const totals = useMemo(() => {
    let retail = 0,
      cost = 0,
      count = 0;
    for (const id of Array.from(selected)) {
      const c = prices[id];
      if (!c) continue;
      retail += c.retail ?? 0;
      cost += c.cost ?? 0;
      count++;
    }
    return { retail, cost, count };
  }, [selected, prices]);

  // One option per category: picking one replaces whatever else was picked in that category;
  // tapping the picked one again clears the category.
  function toggle(id: string) {
    const c = prices[id];
    if (!c || c.retail === null || !book) return;
    const svc = book.services.find((s) => s.items.some((i) => i.id === id));
    // services in the same pick-one group (e.g. PPF Clear + Stealth) share the one choice
    const linked = svc?.group ? book.services.filter((s) => s.group === svc.group) : svc ? [svc] : [];
    setSelected((cur) => {
      const n = new Set(cur);
      if (n.has(id)) {
        n.delete(id);
        return n;
      }
      for (const s of linked) for (const it of s.items) n.delete(it.id);
      n.add(id);
      return n;
    });
  }

  // 17 characters, no I / O / Q (VIN alphabet)
  const vinOk = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);

  async function save(submit: boolean, confirmDuplicate = false) {
    if (!vehicle || !selected.size) return;
    if (submit && !vinOk) {
      setMsg({ text: vin ? `That VIN has ${vin.length} characters — it needs 17 (no I, O or Q).` : "Enter the VIN to submit the order.", err: true });
      document.getElementById("vin")?.focus();
      return;
    }
    setBusy(true);
    setMsg({ text: "" });
    setDup(null);
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleYear: vehicle.year,
        vehicleModel: vehicle.model,
        vehicleTrim: vehicle.trim,
        vehicleVin: vin,
        availableFrom,
        neededBy,
        notes,
        itemIds: Array.from(selected),
        submit,
        confirmDuplicate,
        ...(editId ? { quoteId: editId } : {}),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.status === 409 && data.duplicate) {
      setDup(data.duplicate);
      return;
    }
    if (!res.ok) {
      if (data.alreadySubmitted && editId) {
        router.replace(`/portal/quote/${editId}`);
        return;
      }
      setMsg({ text: data.error || "Could not save.", err: true });
      return;
    }
    if (submit) {
      router.push(`/portal/quote/${data.quote.id}?sent=1`);
    } else {
      setMsg({ text: `Quote ${data.quote.quote_number} saved.` });
      router.push(`/portal/quote/${data.quote.id}`);
    }
  }

  if (!ready || !session || !vehicle || !book) {
    return (
      <div className="frame">
        <main>
          <div className="loading-stage">
            <div className="loading-text">Loading pricing…</div>
          </div>
        </main>
      </div>
    );
  }

  // "Pick one", or for linked services "Pick one — Clear or Stealth"
  const pickOneNote = (svc: PricingBook["services"][number]) => {
    const others = svc.group ? book.services.filter((x) => x.group === svc.group && x.id !== svc.id && x.items.length) : [];
    return others.length ? `Pick one · or ${others.map((x) => x.name).join(" / ")}, not both` : "Pick one";
  };

  const sheetHref = `/portal/sheet?model=${encodeURIComponent(vehicle.model)}&year=${vehicle.year}&trim=${encodeURIComponent(vehicle.trim)}`;

  return (
    <div className="frame">
      <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
      <main>
        <div className="step-rail">
          <div className="step done"><span className="num">1</span> Vehicle</div>
          <div className="step active"><span className="num">2</span> Pricing</div>
          <div className="step"><span className="num">3</span> Order</div>
        </div>

        <div className="stage">
          <div className="nameplate" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div className="meta">{session.dealership.brand.toUpperCase()} · {vehicle.year}{editId ? ` · EDITING QUOTE ${editNumber}` : ""}</div>
              <div className="year-model">{vehicle.model}</div>
              <div className="trim">{vehicle.trim}</div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href={sheetHref} className="btn-ghost btn-sm" style={{ display: "inline-block" }}>
                Print price sheet
              </Link>
              {editId ? (
                <button className="reset" onClick={() => router.push(`/portal/quote/${editId}`)}>BACK TO QUOTE</button>
              ) : (
                <button className="reset" onClick={() => router.push("/portal/vehicle")}>CHANGE VEHICLE</button>
              )}
            </div>
          </div>

          {book.services.map((svc) => (
            <div key={svc.id} className="svc-block" role="radiogroup" aria-label={svc.name}>
              <div className="svc-head">
                <div className="svc-title">{svc.name}</div>
                <div className="svc-note">{svc.note ? `${svc.note} · ` : ""}{pickOneNote(svc)}</div>
              </div>
              {svc.items.length === 0 ? <div style={{ padding: "14px 24px", fontSize: 12, color: "var(--text-3)" }}>No packages yet.</div> : null}
              {svc.items.map((it) => {
                const c = prices[it.id];
                const unpriced = !c || c.retail === null;
                const on = selected.has(it.id);
                return (
                  <div key={it.id} className={"svc-item" + (on ? " selected" : "") + (unpriced ? " unpriced" : "")} onClick={() => toggle(it.id)} role="radio" aria-checked={on} aria-disabled={unpriced || undefined}
                    tabIndex={unpriced ? -1 : 0} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(it.id); } }}>
                    <div className={"svc-radio" + (on ? " on" : "")} />
                    <div className="nm">
                      {it.name}
                      {it.coverage || it.description ? <small>{it.coverage || it.description}</small> : null}
                      {unpriced ? <small>Not priced for this model yet</small> : null}
                    </div>
                    <div className="pr">
                      <div className="retail">{money(c?.retail)}</div>
                      {book.canSeeCost && c && c.cost !== null ? (
                        <div className="cost">
                          cost <b>{money(c.cost)}</b> · margin <b>{money((c.retail ?? 0) - c.cost)}</b>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="deal-builder">
            <div className="db-head">
              <div className="section-eyebrow">ORDER</div>
              <div className="alacarte-title">Build the order</div>
            </div>
            <div className="db-summary">
              {totals.count === 0 ? <div className="db-empty">Select the services above to add them to this order.</div> : null}
              {Array.from(selected).map((id) => {
                const it = book.services.flatMap((s) => s.items).find((i) => i.id === id);
                const c = prices[id];
                return it ? (
                  <div key={id} className="db-line">
                    <span className="db-line-name">{it.name}</span>
                    <span className="db-line-amt">{money(c?.retail)}</span>
                  </div>
                ) : null;
              })}
              <div className="db-total">
                <span>TOTAL{book.canSeeCost && totals.count ? ` · YOUR COST ${money(totals.cost)}` : ""}</span>
                <span className="db-total-amt">{money(totals.retail)}</span>
              </div>
            </div>
            <div className="db-fields">
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="vin">VIN {vin ? <span style={{ color: vinOk ? "var(--gold)" : "var(--text-3)", letterSpacing: 0, textTransform: "none" }}>· {vinOk ? "✓" : `${vin.length}/17`}</span> : null}</label>
                <input id="vin" value={vin} autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "0.08em" }}
                  onChange={(e) => cleanChange(e, cleanVin, setVin)} placeholder="17 characters — required to submit" />
              </div>
              <div className="field"><label htmlFor="avail">Vehicle available from</label><input id="avail" type="date" value={availableFrom} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setAvailableFrom(e.target.value)} /></div>
              <div className="field"><label htmlFor="needed">Needed back by</label><input id="needed" type="date" value={neededBy} min={availableFrom || new Date().toISOString().slice(0, 10)} onChange={(e) => setNeededBy(e.target.value)} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="notes">Notes for White Glove Auto</label><input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests…" /></div>
            </div>
            <div className="db-actions">
              <button className="btn-ghost" disabled={busy || !totals.count} onClick={() => save(false)}>{editId ? "Save changes" : "Save quote"}</button>
              <button className="btn-primary" disabled={busy || !totals.count} onClick={() => save(true)}>{busy ? "Sending…" : "Submit order"}</button>
            </div>
            {dup ? (
              <div className="dup-warn" role="alert">
                <b>This car was already ordered.</b> Same {dup.match} as order <b>{dup.quote_number}</b>{dup.ro ? ` (RO ${dup.ro})` : ""}, submitted {new Date(dup.submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{dup.by ? ` by ${dup.by}` : ""} — {dup.services || "services on file"}. Status: {String(dup.status).replace("_", " ")}.
                <div style={{ marginTop: 6 }}>If you&apos;re adding services to that car, submit anyway and say so in the notes. If it&apos;s a mistake, open the existing order instead.</div>
                <div className="dup-actions">
                  <Link href={`/portal/quote/${dup.id}`} className="btn-ghost btn-sm" style={{ display: "inline-block" }}>Open {dup.quote_number}</Link>
                  <button className="btn-primary btn-sm" disabled={busy} onClick={() => save(true, true)}>Submit anyway</button>
                  <button className="link-btn" onClick={() => setDup(null)}>Cancel</button>
                </div>
              </div>
            ) : null}
            <div className="db-note" style={{ color: msg.err ? "var(--warn)" : undefined }}>
              {msg.text || (
                <>
                  <b>Save quote</b> keeps it for later (VIN optional). <b>Submit order</b> sends the VIN and selected services to White Glove Auto for scheduling.
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
