"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { setSelectedVehicle } from "@/lib/vehicleStore";
import type { VehicleCatalog } from "@/lib/types";

export default function VehiclePage() {
  const router = useRouter();
  const [dealershipName, setDealershipName] = useState("");
  const [catalog, setCatalog] = useState<VehicleCatalog | null>(null);
  const [loading, setLoading] = useState(true);

  const [year, setYear] = useState<number | "">("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");

  // Auth check + initial data load
  useEffect(() => {
    (async () => {
      const sessRes = await fetch("/api/auth/session");
      if (!sessRes.ok) {
        router.replace("/");
        return;
      }
      const sess = await sessRes.json();
      setDealershipName(sess.dealership.name);

      const vehRes = await fetch("/api/vehicles");
      if (vehRes.ok) {
        setCatalog(await vehRes.json());
      }
      setLoading(false);
    })();
  }, [router]);

  const models =
    year && catalog ? Object.keys(catalog.byYear[year] || {}) : [];
  const trims =
    year && model && catalog ? catalog.byYear[year]?.[model] || [] : [];

  function handleYear(v: string) {
    setYear(v ? Number(v) : "");
    setModel("");
    setTrim("");
  }
  function handleModel(v: string) {
    setModel(v);
    setTrim("");
  }

  function handleContinue() {
    if (year === "" || !model || !trim) return;
    setSelectedVehicle({ year: Number(year), model, trim });
    router.push("/portal/pricing");
  }

  const summary =
    year && model && trim ? (
      <>
        {year} {model}{" "}
        <span style={{ color: "var(--gold-bright)" }}>{trim}</span>
      </>
    ) : year && model ? (
      <>
        {year} {model} <span className="placeholder">— select trim</span>
      </>
    ) : year ? (
      <>
        {year} <span className="placeholder">— select model</span>
      </>
    ) : (
      <span className="placeholder">Selection will appear here.</span>
    );

  if (loading) {
    return (
      <div className="frame">
        <main>
          <div className="loading-stage">
            <div className="loading-text">Loading…</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="frame">
      <AppHeader dealershipName={dealershipName} />
      <main>
        <nav className="step-rail">
          <div className="step active">
            <span className="num">1</span> Select Vehicle
          </div>
          <div className="step">
            <span className="num">2</span> Review Pricing
          </div>
          <div className="step">
            <span className="num">3</span> Generate Quote
          </div>
        </nav>

        <section className="stage">
          <div className="stage-head">
            <div className="stage-eyebrow">STEP ONE</div>
            <h2 className="stage-title">Configure the vehicle.</h2>
            <p className="stage-sub">
              Select model year, model, and trim to pull current XPEL Design
              Access Program pricing for paint protection film coverage.
            </p>
          </div>

          <div className="picker-grid">
            <div className="field">
              <label htmlFor="sel-year">Year</label>
              <select
                id="sel-year"
                value={year}
                onChange={(e) => handleYear(e.target.value)}
              >
                <option value="">Select year</option>
                {catalog?.years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sel-model">Model</label>
              <select
                id="sel-model"
                value={model}
                onChange={(e) => handleModel(e.target.value)}
                disabled={!year}
              >
                <option value="">
                  {year ? "Select model" : "Select year first"}
                </option>
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sel-trim">Trim</label>
              <select
                id="sel-trim"
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                disabled={!model}
              >
                <option value="">
                  {model ? "Select trim" : "Select model first"}
                </option>
                {trims.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="picker-actions">
            <div className="picker-summary">{summary}</div>
            <button
              className="btn-primary"
              onClick={handleContinue}
              disabled={!trim}
            >
              Continue →
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
