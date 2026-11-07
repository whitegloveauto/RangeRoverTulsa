"use client";

// Line-art SUV diagram (side profile + plan view) with highlightable protection zones.
// Shapes are keyed by model family so a Defender reads boxy, a Velar/Evoque reads sleek, etc.
// This is intentionally a schematic, not a trim-accurate rendering: it shows WHAT is covered.

export const ZONES: { id: string; label: string }[] = [
  { id: "full_body", label: "Every painted panel" },
  { id: "hood", label: "Hood" },
  { id: "front_bumper", label: "Front bumper" },
  { id: "fenders", label: "Front fenders" },
  { id: "mirrors", label: "Mirror caps" },
  { id: "headlights", label: "Headlights" },
  { id: "a_pillars", label: "A-pillars" },
  { id: "roof", label: "Roof" },
  { id: "doors", label: "Doors" },
  { id: "door_cups", label: "Door handle cups" },
  { id: "door_edges", label: "Door edges" },
  { id: "rockers", label: "Rocker panels" },
  { id: "rear_bumper", label: "Rear bumper" },
  { id: "rear_bumper_top", label: "Rear bumper top / loading edge" },
  { id: "trunk", label: "Tailgate" },
  { id: "windshield", label: "Windshield" },
  { id: "side_windows", label: "Side windows" },
  { id: "rear_window", label: "Rear glass" },
  { id: "sunroof", label: "Panoramic roof" },
  { id: "wheels", label: "Wheels" },
];

type Family = "fullsize" | "sport" | "coupe" | "boxy";
export function familyFor(model: string): Family {
  const m = String(model || "").toLowerCase();
  if (m.includes("defender")) return "boxy";
  if (m.includes("velar") || m.includes("evoque")) return "coupe";
  if (m.includes("sport") || m.includes("discovery sport")) return "sport";
  if (m.includes("discovery")) return "fullsize";
  return "fullsize";
}

// Side-profile geometry, parametric per family (viewBox 0 0 400 150).
// A real Range Rover profile: clamshell hood, raked screen, floating roof, big arches, short overhangs.
type Geo = { [k: string]: any; wheelF: [number, number]; wheelR: [number, number]; cups: [number, number][] };
function geo(fam: Family): Geo {
  // tunables
  const roofY = fam === "coupe" ? 36 : fam === "boxy" ? 26 : fam === "sport" ? 30 : 28;
  const aBaseX = fam === "boxy" ? 128 : 134;          // windshield base
  const aTopX = fam === "boxy" ? 146 : fam === "coupe" ? 176 : 168; // top of A-pillar
  const roofEndX = fam === "coupe" ? 292 : fam === "boxy" ? 344 : fam === "sport" ? 312 : 322;
  const dBaseX = fam === "coupe" ? 352 : fam === "boxy" ? 366 : 356; // rear glass base
  const tailTopY = fam === "boxy" ? 60 : fam === "coupe" ? 74 : 66;
  const hoodFrontY = fam === "boxy" ? 70 : 78;
  const cowlY = fam === "boxy" ? 62 : 60;
  const beltY = fam === "coupe" ? 66 : 62;
  const wf: [number, number] = [96, 114];
  const wr: [number, number] = [316, 114];
  const body = `M22,118 L22,96 Q22,88 30,86 L44,${hoodFrontY} Q80,${hoodFrontY - 6} ${aBaseX - 16},${cowlY + 6} Q${aBaseX - 6},${cowlY + 4} ${aBaseX},${cowlY} L${aTopX},${roofY + 6} Q${aTopX + 8},${roofY} ${aTopX + 20},${roofY} L${roofEndX},${roofY} Q${roofEndX + 14},${roofY} ${roofEndX + 20},${roofY + 6} L${dBaseX},${beltY} Q${dBaseX + 4},${beltY + 2} ${dBaseX + 10},${beltY + 2} L380,${tailTopY + 4} Q386,${tailTopY + 8} 386,${tailTopY + 18} L386,118 Z`;
  const roof = `M${aTopX + 20},${roofY} L${roofEndX},${roofY} Q${roofEndX + 14},${roofY} ${roofEndX + 20},${roofY + 6} L${roofEndX + 14},${roofY + 10} L${aTopX + 10},${roofY + 10} Q${aTopX + 12},${roofY + 3} ${aTopX + 20},${roofY} Z`;
  const windshield = `M${aBaseX + 2},${cowlY + 2} L${aTopX + 2},${roofY + 8} L${aTopX + 16},${roofY + 8} L${aBaseX + 18},${beltY} Z`;
  const apillar = `M${aBaseX},${cowlY} L${aTopX},${roofY + 6} Q${aTopX + 8},${roofY} ${aTopX + 20},${roofY} L${aTopX + 10},${roofY + 10} L${aBaseX + 18},${beltY} Z`;
  const sideGlass = `M${aBaseX + 22},${beltY} L${aTopX + 18},${roofY + 10} L${roofEndX + 10},${roofY + 10} L${dBaseX - 4},${beltY} Z`;
  const rearGlass = `M${dBaseX - 2},${beltY} L${roofEndX + 12},${roofY + 10} L${roofEndX + 16},${roofY + 10} L${dBaseX + 6},${beltY} Z`;
  const hood = `M44,${hoodFrontY} Q80,${hoodFrontY - 6} ${aBaseX - 16},${cowlY + 6} Q${aBaseX - 6},${cowlY + 4} ${aBaseX},${cowlY} L${aBaseX},${cowlY + 9} Q${aBaseX - 6},${cowlY + 12} ${aBaseX - 16},${cowlY + 14} Q82,${hoodFrontY + 3} 46,${hoodFrontY + 9} Z`;
  const fender = `M46,${hoodFrontY + 9} Q82,${hoodFrontY + 3} ${aBaseX - 16},${cowlY + 14} L${aBaseX},${cowlY + 9} L${aBaseX + 2},112 L128,112 L64,112 L64,98 L50,98 Z`;
  const frontBumper = `M22,96 Q22,88 30,86 L46,${hoodFrontY + 9} L50,98 L64,98 L64,118 L22,118 Z`;
  const door = `M${aBaseX + 2},${beltY + 8} L${dBaseX - 20},${beltY + 8} L${dBaseX - 20},112 L${aBaseX + 2},112 Z`;
  const rocker = `M124,110 L292,110 L292,118 L124,118 Z`;
  const rearBumper = `M340,100 L386,100 L386,118 L340,118 Z`;
  const trunk = `M${dBaseX + 10},${beltY + 2} L380,${tailTopY + 4} Q386,${tailTopY + 8} 386,${tailTopY + 18} L386,100 L346,100 Z`;
  const mirror = `M${aBaseX + 10},${beltY + 2} L${aBaseX + 26},${beltY + 2} L${aBaseX + 26},${beltY + 12} L${aBaseX + 10},${beltY + 12} Z`;
  const headlight = `M30,88 L46,${hoodFrontY + 9} L48,97 L32,97 Z`;
  return { body, roof, windshield, apillar, sideGlass, rearGlass, hood, fender, frontBumper, door, rocker, rearBumper, trunk, mirror, headlight, wheelF: wf, wheelR: wr, cups: [[200, beltY + 24], [284, beltY + 24]] as [number, number][] };
}

const ink = "#2A3A32";
const paint = "#F4F1E8";
const glass = "#DCE6E2";
const hiFill = "rgba(184,153,104,0.55)";
const hiStroke = "#8A7752";

function Zone({ d, on }: { d: string; on: boolean }) {
  return <path d={d} fill={on ? hiFill : "none"} stroke={on ? hiStroke : "none"} strokeWidth={1.5} />;
}

export default function VehicleDiagram({ model, zones, showLegend = true }: { model: string; zones: string[]; showLegend?: boolean }) {
  const fam = familyFor(model);
  const g = geo(fam);
  const z = new Set(zones);
  const all = z.has("full_body");
  const on = (...ids: string[]) => all || ids.some((i) => z.has(i));

  return (
    <div style={{ width: "100%" }}>
      <svg viewBox="0 0 400 290" width="100%" style={{ display: "block" }} role="img" aria-label={`${model} protection diagram`}>
        {/* ---------- SIDE PROFILE ---------- */}
        <g transform="translate(0,4)">
          <path d={g.body} fill={paint} stroke={ink} strokeWidth={2} strokeLinejoin="round" />
          {/* floating-roof pillars */}
          <path d={g.apillar} fill="#1E2622" opacity={0.85} />
          <path d={g.rearGlass} fill="#1E2622" opacity={0.85} />
          <path d={g.sideGlass} fill={glass} stroke={ink} strokeWidth={1.2} />
          <path d={g.windshield} fill={glass} stroke={ink} strokeWidth={1.2} />
          {/* panel lines */}
          <path d={g.door} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.5} />
          <path d={g.hood} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.5} />
          <path d={g.trunk} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.5} />
          {/* zone highlights (painted) */}
          <Zone d={g.hood} on={on("hood")} />
          <Zone d={g.fender} on={on("fenders")} />
          <Zone d={g.frontBumper} on={on("front_bumper")} />
          <Zone d={g.door} on={on("doors")} />
          <Zone d={g.rocker} on={on("rockers")} />
          <Zone d={g.rearBumper} on={on("rear_bumper")} />
          <Zone d={g.trunk} on={on("trunk")} />
          <Zone d={g.roof} on={on("roof")} />
          <Zone d={g.apillar} on={on("a_pillars")} />
          <Zone d={g.mirror} on={on("mirrors")} />
          <Zone d={g.headlight} on={on("headlights")} />
          {/* glass zones (never part of full_body) */}
          <path d={g.windshield} fill={z.has("windshield") ? "rgba(90,140,200,0.45)" : "none"} stroke={z.has("windshield") ? "#3F6E9E" : "none"} strokeWidth={1.5} />
          <path d={g.sideGlass} fill={z.has("side_windows") ? "rgba(90,140,200,0.45)" : "none"} stroke={z.has("side_windows") ? "#3F6E9E" : "none"} strokeWidth={1.5} />
          <path d={g.rearGlass} fill={z.has("rear_window") ? "rgba(90,140,200,0.45)" : "none"} stroke={z.has("rear_window") ? "#3F6E9E" : "none"} strokeWidth={1.5} />
          {/* door cups + edges */}
          {z.has("door_cups") && !all ? g.cups.map(([x, y]: [number, number], i: number) => <ellipse key={i} cx={x} cy={y} rx={9} ry={5} fill={hiFill} stroke={hiStroke} strokeWidth={1.2} />) : null}
          {z.has("door_edges") && !all ? <path d={g.door} fill="none" stroke={hiStroke} strokeWidth={3} strokeDasharray="6 4" /> : null}
          {/* mirror + handles always drawn as outline */}
          <path d={g.mirror} fill={paint} stroke={ink} strokeWidth={1} />
          {g.cups.map(([x, y]: [number, number], i: number) => <rect key={i} x={x - 8} y={y - 2} width={16} height={4} rx={2} fill="none" stroke={ink} strokeWidth={0.8} />)}
          {/* wheels */}
          {[g.wheelF, g.wheelR].map(([cx, cy]: [number, number], i: number) => (
            <g key={i}>
              <path d={`M${cx - 33},118 A33,33 0 0 1 ${cx + 33},118 Z`} fill="#F9F8F3" stroke={ink} strokeWidth={1.2} />
              <circle cx={cx} cy={cy} r={25} fill="#1E2622" stroke={ink} strokeWidth={2} />
              <circle cx={cx} cy={cy} r={15} fill={z.has("wheels") ? hiFill : "#C4BFB1"} stroke={z.has("wheels") ? hiStroke : "#6F6B61"} strokeWidth={1.5} />
              {[0, 72, 144, 216, 288].map((a) => <line key={a} x1={cx} y1={cy} x2={cx + 13 * Math.cos((a * Math.PI) / 180)} y2={cy + 13 * Math.sin((a * Math.PI) / 180)} stroke="#6F6B61" strokeWidth={2} />)}
              <circle cx={cx} cy={cy} r={3.5} fill="#6F6B61" />
            </g>
          ))}
          <line x1={10} y1={138} x2={390} y2={138} stroke={ink} strokeWidth={0.6} opacity={0.3} />
        </g>

        {/* ---------- PLAN VIEW (top-down) ---------- */}
        <g transform="translate(0,150)">
          {(() => {
            const boxy = fam === "boxy";
            const bodyTop = boxy ? "M40,30 L360,30 Q380,30 380,50 L380,90 Q380,110 360,110 L40,110 Q20,110 20,90 L20,50 Q20,30 40,30 Z" : "M44,30 L356,30 Q380,32 380,52 L380,88 Q380,108 356,110 L44,110 Q20,108 20,88 L20,52 Q20,32 44,30 Z";
            const hoodTop = "M24,40 L112,36 L112,104 L24,100 Z";
            const wsTop = boxy ? "M112,36 L134,40 L134,100 L112,104 Z" : "M112,36 L150,42 L150,98 L112,104 Z";
            const roofTop = boxy ? "M134,40 L340,38 L340,102 L134,100 Z" : "M150,42 L310,38 L310,102 L150,98 Z";
            const rearGlassTop = boxy ? "M340,38 L364,40 L364,100 L340,102 Z" : "M310,38 L350,44 L350,96 L310,102 Z";
            const trunkTop = boxy ? "M364,40 L378,52 L378,88 L364,100 Z" : "M350,44 L378,54 L378,86 L350,96 Z";
            const sunroof = boxy ? "M150,50 L330,48 L330,92 L150,90 Z" : "M160,52 L300,48 L300,92 L160,90 Z";
            const frontBumperTop = "M20,44 L28,34 L28,106 L20,96 Z";
            const rearBumperTop = "M372,46 L380,56 L380,84 L372,94 Z";
            const fenderL = "M40,30 L112,36 L112,46 L40,46 Z";
            const fenderR = "M40,110 L112,104 L112,94 L40,94 Z";
            const doorsL = boxy ? "M134,30 L340,30 L340,40 L134,40 Z" : "M150,30 L310,30 L310,42 L150,42 Z";
            const doorsR = boxy ? "M134,110 L340,110 L340,100 L134,100 Z" : "M150,110 L310,110 L310,98 L150,98 Z";
            const glassBlue = "rgba(90,140,200,0.45)";
            return (
              <>
                <path d={bodyTop} fill={paint} stroke={ink} strokeWidth={2} />
                <path d={wsTop} fill={glass} stroke={ink} strokeWidth={1} />
                <path d={rearGlassTop} fill={glass} stroke={ink} strokeWidth={1} />
                <path d={hoodTop} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.5} />
                <path d={roofTop} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.5} />
                <path d={trunkTop} fill="none" stroke={ink} strokeWidth={0.8} opacity={0.5} />
                <path d={sunroof} fill={glass} stroke={ink} strokeWidth={0.8} opacity={0.7} />
                {/* mirrors */}
                <rect x={118} y={22} width={14} height={10} rx={2} fill={on("mirrors") ? hiFill : paint} stroke={on("mirrors") ? hiStroke : ink} strokeWidth={1} />
                <rect x={118} y={108} width={14} height={10} rx={2} fill={on("mirrors") ? hiFill : paint} stroke={on("mirrors") ? hiStroke : ink} strokeWidth={1} />
                <Zone d={hoodTop} on={on("hood")} />
                <Zone d={roofTop} on={on("roof")} />
                <Zone d={trunkTop} on={on("trunk")} />
                <Zone d={frontBumperTop} on={on("front_bumper")} />
                <Zone d={rearBumperTop} on={on("rear_bumper", "rear_bumper_top")} />
                <Zone d={fenderL} on={on("fenders")} />
                <Zone d={fenderR} on={on("fenders")} />
                <Zone d={doorsL} on={on("doors")} />
                <Zone d={doorsR} on={on("doors")} />
                <path d={wsTop} fill={z.has("windshield") ? glassBlue : "none"} stroke={z.has("windshield") ? "#3F6E9E" : "none"} strokeWidth={1.5} />
                <path d={rearGlassTop} fill={z.has("rear_window") ? glassBlue : "none"} stroke={z.has("rear_window") ? "#3F6E9E" : "none"} strokeWidth={1.5} />
                <path d={sunroof} fill={z.has("sunroof") ? glassBlue : "none"} stroke={z.has("sunroof") ? "#3F6E9E" : "none"} strokeWidth={1.5} />
                <text x={200} y={130} textAnchor="middle" fontSize={8} letterSpacing={2} fill={ink} opacity={0.6}>FRONT ◀</text>
              </>
            );
          })()}
        </g>
      </svg>
      {showLegend ? (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#555", marginTop: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 14, height: 10, background: hiFill, border: `1px solid ${hiStroke}`, display: "inline-block" }} /> Protected paint</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 14, height: 10, background: "rgba(90,140,200,0.45)", border: "1px solid #3F6E9E", display: "inline-block" }} /> Treated glass</span>
        </div>
      ) : null}
    </div>
  );
}
