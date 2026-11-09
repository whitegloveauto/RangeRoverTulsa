"use client";

import { useEffect, useMemo, useState } from "react";
import WgaHeader from "@/components/WgaHeader";
import { hasPerm } from "@/lib/perms";
import { useWgaSession } from "@/lib/useDealerSession";

interface VehicleRow {
  id: string;
  year: number;
  model: string;
  trim: string;
  sort_order: number;
  active: boolean;
}

// WGA admin: the vehicle catalog (year → model → trims) dealers pick from.
// Pricing is per model, so trims only exist so the right pattern gets cut.
export default function WgaVehiclesPage() {
  const { session, ready } = useWgaSession();
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [newYear, setNewYear] = useState("");
  const [addTrim, setAddTrim] = useState<{ model: string; trim: string } | null>(null);
  const [newModel, setNewModel] = useState({ model: "", trim: "" });

  async function load() {
    const r = await fetch("/api/wga/vehicles");
    if (r.ok) {
      const d = await r.json();
      const v: VehicleRow[] = d.vehicles || [];
      setRows(v);
      setYear((y) => y ?? (v.length ? Math.max(...v.map((x) => x.year)) : null));
    }
  }
  useEffect(() => {
    if (ready) load();
  }, [ready]);

  async function act(body: any) {
    setMsg("");
    setBusy(true);
    try {
      const r = await fetch("/api/wga/vehicles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      await load();
      return d;
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a), [rows]);
  const yearRows = useMemo(() => rows.filter((r) => r.year === year), [rows, year]);
  const models = useMemo(() => {
    const m = new Map<string, VehicleRow[]>();
    for (const r of yearRows) {
      if (!m.has(r.model)) m.set(r.model, []);
      m.get(r.model)!.push(r);
    }
    return Array.from(m.entries()).sort((a, b) => (a[1][0].sort_order - b[1][0].sort_order) || a[0].localeCompare(b[0]));
  }, [yearRows]);

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;
  if (!hasPerm(session.user, "vehicles")) {
    return <div className="frame"><WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} /><main><div className="stage"><div className="notice warn">You don&apos;t have access to this area. Ask an admin on the Team page.</div></div></main></div>;
  }

  return (
    <div className="frame">
      <WgaHeader userName={session.user.name} role={session.user.role} perms={session.user.perms} />
      <main>
        <div className="stage" style={{ maxWidth: 1100 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">VEHICLE CATALOG</div>
            <div className="stage-title">Years, models, trims.</div>
            <div className="stage-sub">What dealers can pick when they build an order. Pricing is per model, so a new trim needs no pricing — it just makes sure the right pattern gets cut. When a new model year drops, copy the previous year and adjust.</div>
          </div>
          {msg ? <div className="notice warn">{msg}</div> : null}

          <div className="tabs" style={{ flexWrap: "wrap" }}>
            {years.map((y) => (
              <button key={y} className={year === y ? "active" : ""} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>

          <div className="card" style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <div className="field" style={{ minWidth: 140 }}>
              <label htmlFor="ny">Add a model year</label>
              <input id="ny" type="number" placeholder={String((years[0] || 2027) + 1)} value={newYear} onChange={(e) => setNewYear(e.target.value)} />
            </div>
            <button
              className="btn-primary btn-sm"
              disabled={busy || !newYear || !year}
              onClick={async () => {
                const d = await act({ action: "model.copyYear", fromYear: year, toYear: Number(newYear) });
                if (d) {
                  setYear(Number(newYear));
                  setNewYear("");
                  setMsg(`${d.added} model/trim rows copied from ${year} to ${newYear}.`);
                }
              }}
            >
              Copy {year} lineup → {newYear || "new year"}
            </button>
          </div>

          {models.map(([model, trims]) => {
            const anyActive = trims.some((t) => t.active);
            return (
              <div key={model} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={{ marginBottom: 2, opacity: anyActive ? 1 : 0.5 }}>{model}</h3>
                    <div style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.1em" }}>{year} · {trims.filter((t) => t.active).length} of {trims.length} trims active</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="move-btns">
                      <button className="btn-ghost btn-sm" disabled={busy} title="Move up" onClick={() => act({ action: "model.move", model, dir: -1 })}>▲</button>
                      <button className="btn-ghost btn-sm" disabled={busy} title="Move down" onClick={() => act({ action: "model.move", model, dir: 1 })}>▼</button>
                    </span>
                    <button className="btn-ghost btn-sm" disabled={busy} onClick={() => {
                      const newName = prompt(`Rename "${model}" across all years (pricing follows the new name):`, model);
                      if (newName && newName.trim() !== model) act({ action: "model.rename", model, newName: newName.trim() });
                    }}>Rename</button>
                    <button className="btn-ghost btn-sm" disabled={busy} onClick={() => act({ action: "model.setActive", model, year, active: !anyActive })}>{anyActive ? `Hide for ${year}` : `Show for ${year}`}</button>
                    <button className="btn-primary btn-sm" disabled={busy} onClick={() => setAddTrim({ model, trim: "" })}>+ Trim</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                  {trims.map((t) => (
                    <span key={t.id} className={"status-pill " + (t.active ? "scheduled" : "cancelled")} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      {t.trim}
                      <button className="link-btn" title="Toggle active" onClick={() => act({ action: "trim.update", id: t.id, active: !t.active })}>{t.active ? "hide" : "show"}</button>
                      <button className="link-btn danger" title="Delete" onClick={() => confirm(`Delete ${year} ${model} ${t.trim}?`) && act({ action: "trim.delete", id: t.id })}>×</button>
                    </span>
                  ))}
                </div>
                {addTrim?.model === model ? (
                  <form
                    style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "end" }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const d = await act({ action: "trim.create", year, model, trim: addTrim.trim });
                      if (d) setAddTrim(null);
                    }}
                  >
                    <div className="field"><label>New trim for {year} {model}</label><input autoFocus value={addTrim.trim} onChange={(e) => setAddTrim({ model, trim: e.target.value })} placeholder="e.g. Autobiography LWB" required /></div>
                    <button className="btn-primary btn-sm" disabled={busy}>Add</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setAddTrim(null)}>Cancel</button>
                  </form>
                ) : null}
              </div>
            );
          })}

          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Add a new model to {year}</h3>
            <form
              style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}
              onSubmit={async (e) => {
                e.preventDefault();
                const d = await act({ action: "trim.create", year, model: newModel.model, trim: newModel.trim });
                if (d) setNewModel({ model: "", trim: "" });
              }}
            >
              <div className="field"><label>Model</label><input value={newModel.model} onChange={(e) => { const v = e.target.value; setNewModel((p) => ({ ...p, model: v })); }} placeholder="e.g. Range Rover Electric" required /></div>
              <div className="field"><label>First trim</label><input value={newModel.trim} onChange={(e) => { const v = e.target.value; setNewModel((p) => ({ ...p, trim: v })); }} placeholder="e.g. SE" required /></div>
              <button className="btn-primary btn-sm" disabled={busy || !year}>Add model</button>
            </form>
            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 10 }}>A new model shows up as a new row on the Pricing grid — price it there before dealers can order it.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
