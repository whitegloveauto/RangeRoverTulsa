"use client";

import { useEffect, useState } from "react";
import { cleanChange, cleanVin } from "@/lib/caret";
import AppHeader from "@/components/AppHeader";
import { useDealerSession } from "@/lib/useDealerSession";

const CATS: [string, string][] = [["ppf", "Paint protection film"], ["ceramic", "Ceramic coating"], ["tint", "Window tint"], ["windshield", "Windshield film"], ["other", "Other"]];
const STATUS_LABEL: Record<string, string> = { open: "Open", scheduled: "Scheduled", resolved: "Resolved", declined: "Declined" };

// Dealer: file a comeback / warranty issue against a vehicle we've already done, and track it.
export default function ComebacksPage() {
  const { session, ready } = useDealerSession();
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [manual, setManual] = useState(false);
  const [form, setForm] = useState({ vehicle: "", vin: "", category: "ppf", description: "" });
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/comebacks");
    if (r.ok) setList((await r.json()).comebacks || []);
  }
  useEffect(() => {
    if (ready) load();
  }, [ready]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/comebacks?q=${encodeURIComponent(q.trim())}`);
      if (r.ok) setResults((await r.json()).results || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body: any = { category: form.category, description: form.description };
    if (picked) body.quote_id = picked.id;
    else Object.assign(body, { vehicle: form.vehicle, vin: form.vin });
    const r = await fetch("/api/comebacks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ text: d.error || "Could not file." });
    setMsg({ text: `Filed ${d.comeback.comeback_number}. White Glove Auto has been alerted and will reach out to schedule.`, ok: true });
    setPicked(null);
    setQ("");
    setForm({ vehicle: "", vin: "", category: "ppf", description: "" });
    load();
  }

  if (!ready || !session) return <div className="frame"><main><div className="loading-stage"><div className="loading-text">Loading…</div></div></main></div>;

  return (
    <div className="frame">
      <AppHeader dealershipName={session.dealership.name} role={session.user.role} userName={session.user.name} />
      <main>
        <div className="stage" style={{ maxWidth: 980 }}>
          <div className="stage-head">
            <div className="stage-eyebrow">COMEBACKS &amp; WARRANTY</div>
            <div className="stage-title">Something needs a second look.</div>
            <div className="stage-sub">A customer came back with a lifted edge, a bubble, a scratch in the film? Find the original job, tell us what&apos;s going on, and we&apos;ll take it from there. It stays on that vehicle&apos;s history.</div>
          </div>

          <form className="card" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <div className="field">
              <label htmlFor="q">Find the original job</label>
              <input id="q" value={q} onChange={(e) => { setQ(e.target.value); setPicked(null); }} placeholder="VIN (or last 6), model, quote # or RO" autoComplete="off" />
            </div>
            {results.length && !picked ? (
              <div style={{ display: "grid", gap: 6 }}>
                {results.map((r) => (
                  <button type="button" key={r.id} className="result-row" onClick={() => { setPicked(r); setResults([]); setQ(""); }}>
                    <b>{r.vehicle_year} {r.vehicle_model} {r.vehicle_trim}</b>
                    <span>{r.vehicle_vin ? <span className="vin">VIN {r.vehicle_vin}</span> : "no VIN"} · {(r.line_items || []).map((l: any) => l.name).join(", ")}</span>
                    <span>{r.quote_number}{r.sm_order_number ? ` · RO ${r.sm_order_number}` : ""} · {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : ""}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {q.trim().length >= 2 && results.length === 0 && !picked ? <div style={{ fontSize: 12, color: "var(--text-3)" }}>No past orders match. <button type="button" className="link-btn" onClick={() => setManual(true)}>Enter the vehicle manually</button></div> : null}
            {picked ? (
              <div className="picked">
                <div><b>{picked.vehicle_year} {picked.vehicle_model} {picked.vehicle_trim}</b>{picked.vehicle_vin ? <> · <span className="vin">VIN {picked.vehicle_vin}</span></> : ""}</div>
                <div style={{ fontSize: 11, color: "var(--text-3)" }}>{(picked.line_items || []).map((l: any) => l.name).join(", ")} · {picked.quote_number}{picked.sm_order_number ? ` · RO ${picked.sm_order_number}` : ""}</div>
                <button type="button" className="link-btn" onClick={() => setPicked(null)}>Change</button>
              </div>
            ) : null}
            {manual && !picked ? (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
                <div className="field"><label>VIN</label><input value={form.vin} autoCapitalize="characters" autoCorrect="off" spellCheck={false} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "0.08em" }} onChange={(e) => cleanChange(e, cleanVin, (vin) => setForm((f) => ({ ...f, vin })))} placeholder="17 characters" /></div>
                <div className="field"><label>Year / model</label><input value={form.vehicle} onChange={(e) => { const v = e.target.value; setForm((p) => ({ ...p, vehicle: v })); }} placeholder="2025 Range Rover Sport" /></div>
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 2fr" }} className="two">
              <div className="field"><label>What it&apos;s about</label><select value={form.category} onChange={(e) => { const v = e.target.value; setForm((p) => ({ ...p, category: v })); }}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div className="field"><label>What&apos;s going on</label><textarea rows={3} value={form.description} onChange={(e) => { const v = e.target.value; setForm((p) => ({ ...p, description: v })); }} placeholder="Where on the vehicle, what it looks like, when the customer noticed it, and when they can bring it in." required style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--stroke)", color: "var(--text)", padding: "10px 12px", fontFamily: "inherit", fontSize: 13, lineHeight: 1.5 }} /></div>
            </div>
            {msg ? <div className={"notice " + (msg.ok ? "ok" : "warn")}>{msg.text}</div> : null}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" disabled={busy || (!picked && !manual) || !form.description.trim()}>{busy ? "Sending…" : "Send to White Glove Auto"}</button>
            </div>
          </form>

          <div className="stage-head" style={{ marginTop: 30, marginBottom: 12 }}><div className="stage-eyebrow">YOUR COMEBACKS</div></div>
          <div className="order-cards" style={{ display: "flex" }}>
            {list.length === 0 ? <div className="card" style={{ textAlign: "center" }}>None filed.</div> : null}
            {list.map((c) => (
              <div key={c.id} className="order-card">
                <div className="oc-top"><span className={"status-pill " + (c.status === "open" ? "new" : c.status === "scheduled" ? "scheduled" : c.status === "resolved" ? "complete" : "cancelled")}>{STATUS_LABEL[c.status] || c.status}</span><span className="oc-num">{c.comeback_number}</span></div>
                <div className="oc-vehicle">{c.vehicle || "Vehicle"} {c.vin ? <span className="vin">VIN {c.vin}</span> : null}</div>
                <div className="oc-services">{c.description}</div>
                <div className="oc-meta">
                  <span>{CATS.find((x) => x[0] === c.category)?.[1]}</span>
                  <span>Filed {new Date(c.created_at).toLocaleDateString()} by {c.created_by_name}</span>
                  {c.scheduled_date ? <span>Scheduled {c.scheduled_date}</span> : null}
                  {c.sm_order_number ? <span>RO {c.sm_order_number}</span> : null}
                </div>
                {c.wga_notes ? <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-2)", borderLeft: "2px solid var(--gold-dim)", paddingLeft: 10 }}><b style={{ color: "var(--text-3)", fontSize: 10, letterSpacing: "0.14em" }}>WHITE GLOVE AUTO</b><br />{c.wga_notes}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
