import type { PacketData } from "@/lib/packet";

// THE quote document — one document for everyone: what the dealership prints, saves as PDF, or
// sends the customer as a link. Dealership-branded only (never names or shows White Glove Auto),
// no internal dates or ticket numbers, no vehicle diagrams.

const C = { ink: "#0C1A14", gold: "#8A7752", accent: "#B89968", rule: "#DDD9CF", tint: "#F7F4ED", text: "#333", muted: "#666" };
const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const QUOTE_DOC_CSS = `
  .qdoc { width: 100%; max-width: 780px; margin: 0 auto; background: #fff; color: #1A1A1A; padding: 56px 56px 40px; box-shadow: 0 20px 60px rgba(0,0,0,0.4); font-family: 'Inter', system-ui, sans-serif; }
  .qdoc .serif { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; }
  .qdoc .eyebrow { font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: ${C.gold}; }
  .qdoc .svc { margin-top: 26px; break-inside: avoid; page-break-inside: avoid; }
  .qdoc .svc-head { padding-bottom: 8px; border-bottom: 1px solid ${C.rule}; }
  .qdoc .facts { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 4px; }
  .qdoc .facts li { position: relative; padding-left: 14px; font-size: 11.5px; line-height: 1.5; color: ${C.text}; }
  .qdoc .facts li::before { content: ""; position: absolute; left: 0; top: 6px; width: 5px; height: 5px; background: ${C.accent}; transform: rotate(45deg); }
  .qdoc .line { padding: 10px 0; border-bottom: 1px solid #EEEAE1; }
  .qdoc .line:last-child { border-bottom: 0; }
  .qdoc .line-top { display: flex; justify-content: space-between; gap: 16px; font-size: 13.5px; color: ${C.text}; }
  .qdoc .includes { font-size: 11.5px; color: ${C.muted}; line-height: 1.55; margin-top: 4px; max-width: 580px; }
  @media (max-width: 720px) {
    .qdoc { padding: 28px 20px 24px; }
    .qdoc .head { flex-direction: column; align-items: flex-start !important; gap: 14px; }
    .qdoc .head .right { text-align: left !important; }
  }
  @media print {
    .qdoc { box-shadow: none !important; margin: 0 !important; max-width: 100% !important; padding: 0 !important; }
  }
`;

export default function QuoteDocument({ data, status }: { data: PacketData; status?: string }) {
  const { quote: q, dealership, lines, services, brand } = data;
  const dateStr = new Date(q.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // Sections in catalog order; any line whose service was since renamed still gets its own section.
  const known = new Map(services.map((s) => [s.name, s]));
  const order = [...services.map((s) => s.name), ...Array.from(new Set(lines.map((l) => l.service))).filter((n) => !known.has(n))];
  const sections = order.map((name) => ({ svc: known.get(name) || null, name, lines: lines.filter((l) => l.service === name) })).filter((g) => g.lines.length);
  const isOrder = status ? status !== "draft" : !!q.submitted_at;

  return (
    <div className="qdoc">
      <style dangerouslySetInnerHTML={{ __html: QUOTE_DOC_CSS }} />
      {/* Letterhead — the dealership's brand only */}
      <div className="head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${C.ink}`, paddingBottom: 20 }}>
        <div>
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt={brand.name} style={{ height: 40, width: "auto", maxWidth: 150, objectFit: "contain", display: "block", marginBottom: 8 }} />
          ) : (
            <div className="serif" style={{ fontSize: 24, color: C.ink, marginBottom: 6 }}>{dealership.name}</div>
          )}
          <div className="eyebrow" style={{ letterSpacing: "0.18em" }}>Paint Protection · Ceramic · Window Film</div>
        </div>
        <div className="right" style={{ textAlign: "right" }}>
          <div className="eyebrow">Prepared by</div>
          <div className="serif" style={{ fontSize: 19, color: C.ink, marginTop: 2 }}>{dealership.name}</div>
          {data.preparedBy ? <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{data.preparedBy}</div> : null}
        </div>
      </div>

      {/* Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, marginTop: 28, marginBottom: 22 }}>
        <div className="serif" style={{ fontStyle: "italic", fontSize: 34, color: C.ink, lineHeight: 1.1 }}>{isOrder ? "Protection Order" : "Protection Quote"}</div>
        <div style={{ textAlign: "right", fontSize: 11, color: "#555", whiteSpace: "nowrap" }}>
          <b style={{ color: C.ink }}>{q.quote_number}</b>
          <div style={{ marginTop: 2 }}>{dateStr}</div>
        </div>
      </div>

      {/* Vehicle */}
      <div style={{ background: C.tint, borderLeft: `3px solid ${C.accent}`, padding: "16px 20px", marginBottom: 6 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Vehicle</div>
        <div className="serif" style={{ fontSize: 22, color: C.ink }}>
          {q.vehicle_year} {q.vehicle_model} <span style={{ fontStyle: "italic", color: C.gold }}>{q.vehicle_trim}</span>
        </div>
        {q.vehicle_vin || q.customer_name ? (
          <div style={{ display: "flex", gap: 24, marginTop: 8, fontSize: 11, color: "#555", flexWrap: "wrap" }}>
            {q.customer_name ? <span>Prepared for: {q.customer_name}</span> : null}
            {q.vehicle_vin ? <span>VIN: <span className="vin">{q.vehicle_vin}</span></span> : null}
          </div>
        ) : null}
      </div>

      <p style={{ fontSize: 12, lineHeight: 1.7, color: C.text, margin: "18px 0 0" }}>
        XPEL is the global leader in automotive surface protection — the film and coating chosen by factory programs and the world&apos;s most demanding owners. Every product below is professionally installed and backed by XPEL&apos;s manufacturer warranty.
      </p>

      {/* Services: product, the pitch, key facts, then each package with what it includes */}
      {sections.map(({ svc, name, lines: ls }) => (
        <div key={name} className="svc">
          <div className="svc-head">
            <div style={{ fontSize: 11, letterSpacing: "0.2em", color: C.ink, fontWeight: 700, textTransform: "uppercase" }}>{name}</div>
            {svc?.product_name && svc.product_name !== name ? <div className="serif" style={{ fontSize: 20, color: C.ink, marginTop: 2 }}>{svc.product_name}</div> : null}
            {svc?.blurb ? <p style={{ fontSize: 11.5, lineHeight: 1.65, color: C.text, margin: "6px 0 0" }}>{svc.blurb}</p> : null}
            {svc?.facts?.length ? <ul className="facts">{svc.facts.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
          </div>
          {ls.map((l) => (
            <div key={l.item_id} className="line">
              <div className="line-top">
                <span style={{ fontWeight: 600, color: C.ink }}>{l.name}</span>
                <span style={{ color: C.ink }}>{money(l.retail)}</span>
              </div>
              {l.coverage ? <div className="includes">Includes: {l.coverage}</div> : null}
              {l.blurb ? <div className="includes" style={{ fontStyle: "italic" }}>{l.blurb}</div> : null}
            </div>
          ))}
        </div>
      ))}

      {/* Total */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, padding: "18px 24px", background: C.ink, color: "#F7F4ED", breakInside: "avoid" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: C.accent }}>Total Investment</div>
        <div className="serif" style={{ fontSize: 30, fontWeight: 500 }}>{money(q.retail_total)}</div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${C.rule}`, fontSize: 10, color: "#999", textAlign: "center", letterSpacing: "0.05em", lineHeight: 1.7 }}>
        Pricing includes professional installation and the applicable XPEL manufacturer warranty. Product claims per XPEL published specifications.
        <br />
        {dealership.name} · This quote is valid for 30 days from the date above.
      </div>
    </div>
  );
}
