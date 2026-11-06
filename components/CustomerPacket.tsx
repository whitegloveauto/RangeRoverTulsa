"use client";

import VehicleDiagram, { ZONES } from "./VehicleDiagram";
import type { PacketData } from "@/lib/packet";

// Customer-facing protection proposal. Light "paper" document, print-ready,
// Land Rover × White Glove Auto co-branded. Rendered for the dealer (with a toolbar)
// and on the public share link (no toolbar).

const C = { ink: "#0C1A14", gold: "#8A7752", goldSoft: "#C9B58A", rule: "#DDD9CF", tint: "#F7F4ED", muted: "#5B5B5B", green: "#0F4D34" };
const money = (v: number) => "$" + Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const zoneLabel = (id: string) => ZONES.find((z) => z.id === id)?.label || id.replace(/_/g, " ");

export const PACKET_CSS = `
  .packet { width: 100%; max-width: 820px; margin: 0 auto; background: #fff; color: #1A1A1A; box-shadow: 0 20px 60px rgba(0,0,0,0.45); font-family: 'Inter', system-ui, sans-serif; }
  .packet .page { padding: 48px 56px; }
  .packet .page + .page { border-top: 1px dashed #DDD9CF; }
  .packet h1, .packet h2, .packet .serif { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; }
  .packet .eyebrow { font-size: 9.5px; letter-spacing: 0.26em; text-transform: uppercase; color: #8A7752; }
  .packet .facts { list-style: none; padding: 0; margin: 10px 0 0; display: grid; gap: 6px; }
  .packet .facts li { position: relative; padding-left: 16px; font-size: 11.5px; line-height: 1.5; color: #333; }
  .packet .facts li::before { content: ""; position: absolute; left: 0; top: 7px; width: 6px; height: 6px; background: #8A7752; transform: rotate(45deg); }
  .packet .sel { display: grid; grid-template-columns: 1fr auto; gap: 4px 24px; padding: 14px 0; border-bottom: 1px solid #DDD9CF; align-items: baseline; }
  .packet .sel .price { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; color: #0C1A14; white-space: nowrap; }
  .packet .chip { display: inline-block; font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: #0F4D34; background: #EEF3EF; border: 1px solid #CFE0D5; padding: 3px 8px; margin: 4px 6px 0 0; border-radius: 2px; }
  @media (max-width: 720px) {
    .packet .page { padding: 26px 18px; }
    .packet .cover-grid { grid-template-columns: 1fr !important; }
    .packet .two { grid-template-columns: 1fr !important; }
  }
  @media print {
    .no-print { display: none !important; }
    body, html { background: #fff !important; }
    .ambient, header.app, .viewas-bar { display: none !important; }
    main { padding: 0 !important; }
    .packet { box-shadow: none; max-width: 100%; }
    .packet .page { padding: 0; page-break-after: always; break-after: page; }
    .packet .page:last-child { page-break-after: auto; break-after: auto; }
    .packet .page + .page { border-top: 0; }
    @page { margin: 0.55in; }
  }
`;

export default function CustomerPacket({ data }: { data: PacketData }) {
  const { quote: q, dealership, lines, services, zones, imageUrl } = data;
  const dateStr = new Date(q.submitted_at || q.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const vehicle = `${q.vehicle_year} ${q.vehicle_model}`;
  const byService = services.map((s) => ({ svc: s, lines: lines.filter((l) => l.service === s.name) })).filter((g) => g.lines.length);

  return (
    <div className="packet">
      {/* ================= PAGE 1 — COVER ================= */}
      <section className="page" style={{ background: `linear-gradient(180deg, #fff 0%, ${C.tint} 100%)` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, paddingBottom: 20, borderBottom: `2px solid ${C.ink}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landrover.png" alt="Land Rover" style={{ height: 46, width: "auto" }} />
            <div style={{ width: 1, height: 38, background: C.rule }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wga-black.png" alt="White Glove Auto" style={{ height: 22, width: "auto" }} />
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="eyebrow">{dealership.name}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{dateStr}</div>
          </div>
        </div>

        <div className="cover-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 36, alignItems: "center", marginTop: 44 }}>
          <div>
            <div className="eyebrow">Protection proposal</div>
            <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: "10px 0 6px", color: C.ink }}>{vehicle}</h1>
            <div className="serif" style={{ fontSize: 22, fontStyle: "italic", color: C.gold }}>{q.vehicle_trim}</div>
            {q.customer_name ? (
              <div style={{ marginTop: 28 }}>
                <div className="eyebrow">Prepared for</div>
                <div className="serif" style={{ fontSize: 24, marginTop: 4, color: C.ink }}>{q.customer_name}</div>
              </div>
            ) : null}
            <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "#333", marginTop: 24, maxWidth: 380 }}>
              A factory-fresh Land Rover deserves to stay that way. This proposal covers the XPEL protection selected for your vehicle — installed by White Glove Auto, Oklahoma&apos;s largest XPEL installer, before you ever take delivery.
            </p>
          </div>
          <div>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={vehicle} style={{ width: "100%", height: "auto", display: "block", borderRadius: 2 }} />
            ) : (
              <VehicleDiagram model={q.vehicle_model} zones={zones} showLegend={false} />
            )}
          </div>
        </div>

        <div style={{ marginTop: 40, paddingTop: 18, borderTop: `1px solid ${C.rule}`, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            ["Selected", `${lines.length} ${lines.length === 1 ? "protection" : "protections"}`],
            ["Investment", money(q.retail_total)],
            ["Installed by", "White Glove Auto · Tulsa"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="eyebrow">{k}</div>
              <div className="serif" style={{ fontSize: 20, marginTop: 4, color: C.ink }}>{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= PAGE 2 — WHAT'S PROTECTED ================= */}
      <section className="page">
        <div className="eyebrow">Your vehicle · what&apos;s covered</div>
        <h2 style={{ fontSize: 30, margin: "8px 0 18px", color: C.ink }}>Where the protection goes.</h2>
        <div className="two" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 30, alignItems: "start" }}>
          <div style={{ background: C.tint, padding: 18, border: `1px solid ${C.rule}` }}>
            <VehicleDiagram model={q.vehicle_model} zones={zones} />
          </div>
          <div>
            {byService.map(({ svc, lines: ls }) => (
              <div key={svc.id} style={{ marginBottom: 18 }}>
                <div className="eyebrow" style={{ color: C.ink }}>{svc.name}</div>
                {ls.map((l) => (
                  <div key={l.item_id} style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{l.name}</div>
                    {l.description ? <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{l.description}</div> : null}
                    <div>{l.zones.map((z) => <span key={z} className="chip">{zoneLabel(z)}</span>)}</div>
                  </div>
                ))}
              </div>
            ))}
            <p style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.6, marginTop: 10 }}>Diagram is schematic. Film is computer-cut from XPEL&apos;s pattern for your exact model and trim, with edges wrapped wherever the panel allows.</p>
          </div>
        </div>
      </section>

      {/* ================= PAGE 3 — THE PRODUCTS ================= */}
      <section className="page">
        <div className="eyebrow">The protection</div>
        <h2 style={{ fontSize: 30, margin: "8px 0 6px", color: C.ink }}>Why XPEL.</h2>
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "#333", maxWidth: 620 }}>
          XPEL is the global leader in automotive surface protection — the film and coating chosen by factory programs and the world&apos;s most demanding owners. Every product below is installed by White Glove Auto&apos;s certified technicians and backed by XPEL&apos;s manufacturer warranty.
        </p>
        <div style={{ marginTop: 22 }}>
          {byService.map(({ svc, lines: ls }) => (
            <div key={svc.id} style={{ padding: "18px 0", borderTop: `1px solid ${C.rule}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div className="eyebrow">{svc.name}</div>
                  <div className="serif" style={{ fontSize: 24, color: C.ink, marginTop: 2 }}>{svc.product_name || svc.name}</div>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{ls.map((l) => l.name).join(" · ")}</div>
              </div>
              {svc.blurb ? <p style={{ fontSize: 12, lineHeight: 1.7, color: "#333", margin: "8px 0 0", maxWidth: 640 }}>{svc.blurb}</p> : null}
              {svc.facts?.length ? <ul className="facts">{svc.facts.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
              {ls.filter((l) => l.blurb).map((l) => (
                <p key={l.item_id} style={{ fontSize: 11.5, lineHeight: 1.6, color: C.muted, margin: "8px 0 0", fontStyle: "italic" }}>{l.name}: {l.blurb}</p>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ================= PAGE 4 — INVESTMENT ================= */}
      <section className="page">
        <div className="eyebrow">Your selections</div>
        <h2 style={{ fontSize: 30, margin: "8px 0 14px", color: C.ink }}>Investment.</h2>
        <div>
          {byService.map(({ svc, lines: ls }) => (
            <div key={svc.id}>
              {ls.map((l) => (
                <div key={l.item_id} className="sel">
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{svc.product_name || svc.name}{l.description ? ` · ${l.description}` : ""}</div>
                  </div>
                  <div className="price">{money(l.retail)}</div>
                </div>
              ))}
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "18px 0", borderBottom: `2px solid ${C.ink}` }}>
            <div className="eyebrow" style={{ color: C.ink }}>Total, installed</div>
            <div className="serif" style={{ fontSize: 34, color: C.ink }}>{money(q.retail_total)}</div>
          </div>
        </div>
        <div className="two" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, marginTop: 26 }}>
          <div>
            <div className="eyebrow">What happens next</div>
            <ul className="facts">
              <li>Your advisor adds the protection to your purchase or lease.</li>
              <li>White Glove Auto installs before delivery — nothing for you to schedule.</li>
              <li>Warranty documents and care instructions come with the vehicle.</li>
            </ul>
          </div>
          <div>
            <div className="eyebrow">Installed by</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wga-black.png" alt="White Glove Auto" style={{ height: 20, width: "auto", margin: "10px 0 6px", display: "block" }} />
            <div style={{ fontSize: 11.5, lineHeight: 1.7, color: "#333" }}>Oklahoma&apos;s largest XPEL installer<br />4121 S 72nd East Ave · Tulsa, OK 74145</div>
          </div>
        </div>
        <div style={{ marginTop: 34, paddingTop: 12, borderTop: `1px solid ${C.rule}`, fontSize: 9.5, color: "#999", lineHeight: 1.7 }}>
          Proposal {q.quote_number}{q.stock_number ? ` · Stock ${q.stock_number}` : ""} · Prepared by {dealership.name}{data.preparedBy ? ` (${data.preparedBy})` : ""} · {dateStr}. Pricing includes professional installation and applicable XPEL manufacturer warranty; valid for 30 days. Product claims per XPEL published specifications.
        </div>
      </section>
    </div>
  );
}
