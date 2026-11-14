// Factory lineups (US market, model years 2020–2027) that the White Glove side can load into the
// vehicle catalog with one click. Pricing is per MODEL, so body styles that take a different film
// pattern are their own model (GLE vs GLE Coupe); trims only pick the right pattern.
//
// Format: model → "Trim:from-to" (a bare "Trim:2024" = that year only, "Trim:2024-" = through 2027).
// 2027 carries the 2026 trims forward where the model continues; hide what a store doesn't get.

const FIRST = 2020;
const LAST = 2027;

type Lineup = Record<string, string[]>;

const MERCEDES: Lineup = {
  "A-Class": ["A 220:2020-2022", "A 220 4MATIC:2020-2022", "AMG A 35:2020-2022"],
  "CLA": ["CLA 250:2020-2025", "CLA 250 4MATIC:2020-2025", "AMG CLA 35:2020-2025", "AMG CLA 45:2020-2023", "AMG CLA 45 S:2024-2025", "CLA 250+ with EQ Technology:2026-", "CLA 350 4MATIC with EQ Technology:2026-", "CLA 220 Hybrid:2027", "CLA 220 4MATIC Hybrid:2027"],
  "C-Class": ["C 300:2020-", "C 300 4MATIC:2020-", "AMG C 43:2020-2021", "AMG C 43:2023-", "AMG C 63:2020-2021", "AMG C 63 S:2020-2021", "AMG C 63 S E Performance:2024-"],
  "C-Class Coupe": ["C 300:2020-2023", "C 300 4MATIC:2020-2023", "AMG C 43:2020-2023", "AMG C 63:2020-2021", "AMG C 63 S:2020-2021"],
  "C-Class Cabriolet": ["C 300:2020-2023", "C 300 4MATIC:2020-2023", "AMG C 43:2020-2023", "AMG C 63:2020-2021", "AMG C 63 S:2020-2021"],
  "CLE Coupe": ["CLE 300 4MATIC:2024-", "CLE 450 4MATIC:2024-", "AMG CLE 53:2024-"],
  "CLE Cabriolet": ["CLE 300 4MATIC:2024-", "CLE 450 4MATIC:2024-", "AMG CLE 53:2025-"],
  "E-Class": ["E 350:2020-", "E 350 4MATIC:2020-", "E 450 4MATIC:2020-", "AMG E 53:2020-2023", "AMG E 63 S:2020-2023", "AMG E 53 Hybrid:2025-"],
  "E-Class Wagon": ["E 450 4MATIC:2020", "E 450 4MATIC All-Terrain:2021-", "AMG E 63 S:2020-2023", "AMG E 53 Hybrid:2026-"],
  "E-Class Coupe": ["E 450:2020-2023", "E 450 4MATIC:2020-2023", "AMG E 53:2020-2023"],
  "E-Class Cabriolet": ["E 450:2020-2023", "E 450 4MATIC:2020-2023", "AMG E 53:2020-2023"],
  "CLS": ["CLS 450:2020-2023", "CLS 450 4MATIC:2020-2023", "AMG CLS 53:2020-2023"],
  "S-Class": ["S 450:2020", "S 450 4MATIC:2020", "S 560:2020", "S 560 4MATIC:2020", "S 560e:2020", "AMG S 63:2020", "AMG S 65:2020", "S 500 4MATIC:2021-", "S 580 4MATIC:2021-", "S 580e 4MATIC:2023-", "AMG S 63 E Performance:2024-2026"],
  "S-Class Coupe": ["S 560 4MATIC:2020-2021", "AMG S 63:2020-2021", "AMG S 65:2020"],
  "S-Class Cabriolet": ["S 560:2020-2021", "AMG S 63:2020-2021", "AMG S 65:2020"],
  "Maybach S-Class": ["Maybach S 560 4MATIC:2020", "Maybach S 650:2020", "Maybach S 580 4MATIC:2021-", "Maybach S 680 4MATIC:2022-"],
  "SLC": ["SLC 300:2020", "AMG SLC 43:2020"],
  "SL": ["SL 450:2020", "SL 550:2020", "AMG SL 43:2023-", "AMG SL 55:2022-", "AMG SL 63:2022-", "AMG SL 63 S E Performance:2025-", "Maybach SL 680:2026-"],
  "AMG GT": ["AMG GT:2020-2021", "AMG GT C:2020-2021", "AMG GT R:2020-2021", "AMG GT R Pro:2020", "AMG GT Black Series:2021", "AMG GT 43:2025-", "AMG GT 55:2024-", "AMG GT 63:2024-", "AMG GT 63 Pro:2025-", "AMG GT 63 S E Performance:2025-"],
  "AMG GT Roadster": ["AMG GT:2020-2021", "AMG GT C:2020-2021", "AMG GT R:2020"],
  "AMG GT 4-Door Coupe": ["AMG GT 43:2021-2023", "AMG GT 53:2020-2023", "AMG GT 63:2020-2021", "AMG GT 63 S:2020-2021", "AMG GT 63 S E Performance:2023-"],
  "GLA": ["GLA 250:2020-", "GLA 250 4MATIC:2020-", "AMG GLA 35:2021-", "AMG GLA 45:2021-2023"],
  "GLB": ["GLB 250:2020-", "GLB 250 4MATIC:2020-", "AMG GLB 35:2021-2026", "GLB 250+ with EQ Technology:2027", "GLB 350 4MATIC with EQ Technology:2027"],
  "GLC": ["GLC 300:2020-", "GLC 300 4MATIC:2020-", "GLC 350e 4MATIC:2020", "GLC 350e 4MATIC:2025-", "AMG GLC 43:2020-2022", "AMG GLC 43:2024-", "AMG GLC 63:2020-2021", "AMG GLC 63 S E Performance:2025-", "GLC 400 4MATIC with EQ Technology:2027"],
  "GLC Coupe": ["GLC 300 4MATIC:2020-", "AMG GLC 43:2020-2022", "AMG GLC 43:2024-", "AMG GLC 63:2020-2021", "AMG GLC 63 S:2020-2021", "AMG GLC 63 S E Performance:2025-"],
  "GLE": ["GLE 350:2020-", "GLE 350 4MATIC:2020-", "GLE 450 4MATIC:2020-", "GLE 580 4MATIC:2020-", "GLE 450e 4MATIC:2024-", "AMG GLE 53:2021-", "AMG GLE 53 Hybrid:2026-", "AMG GLE 63 S:2021-"],
  "GLE Coupe": ["GLE 450 4MATIC:2024-", "AMG GLE 53:2021-", "AMG GLE 63 S:2021-"],
  "GLS": ["GLS 450 4MATIC:2020-", "GLS 580 4MATIC:2020-", "AMG GLS 63:2021-"],
  "Maybach GLS": ["Maybach GLS 600 4MATIC:2021-"],
  "G-Class": ["G 550:2020-", "AMG G 63:2020-", "AMG G 63 4x4 Squared:2022-2024", "G 580 with EQ Technology:2025-"],
  "EQB": ["EQB 250+:2023-2025", "EQB 300 4MATIC:2022-2025", "EQB 350 4MATIC:2022-2025"],
  "EQE Sedan": ["EQE 350+:2023-2025", "EQE 350 4MATIC:2023-2025", "EQE 500 4MATIC:2023-2025", "AMG EQE:2023-2026", "EQE 320+:2026", "EQE 320 4MATIC:2026"],
  "EQE SUV": ["EQE 350+:2023-2025", "EQE 350 4MATIC:2023-2025", "EQE 500 4MATIC:2023-2025", "AMG EQE:2024-", "EQE 320+:2026-", "EQE 320 4MATIC:2026-"],
  "EQS Sedan": ["EQS 450+:2022-", "EQS 450 4MATIC:2023-", "EQS 580 4MATIC:2022-", "AMG EQS:2022-"],
  "EQS SUV": ["EQS 450+:2023-2025", "EQS 450 4MATIC:2023-2025", "EQS 580 4MATIC:2023-2025", "EQS 400 4MATIC:2026-", "EQS 550 4MATIC:2026-"],
  "Maybach EQS SUV": ["Maybach EQS 680:2024-2026"],
  "Metris": ["Passenger Van:2020-2023", "Cargo Van:2020-2023"],
  "Sprinter": ["Cargo Van 1500:2020-", "Cargo Van 2500:2020-", "Cargo Van 3500:2020-", "Crew Van 2500:2020-", "Passenger Van 1500:2020-", "Passenger Van 2500:2020-"],
  "eSprinter": ["Cargo Van:2024-"],
};

const PORSCHE: Lineup = {
  "718 Boxster": ["Boxster:2020-2025", "Boxster T:2020-2023", "Boxster S:2020-2025", "Boxster GTS 4.0:2021-2025", "Spyder:2020-2023", "Boxster 25 Years:2021", "Boxster Style Edition:2023-2025", "Spyder RS:2024-2025"],
  "718 Cayman": ["Cayman:2020-2025", "Cayman T:2020-2023", "Cayman S:2020-2025", "Cayman GTS 4.0:2021-2025", "Cayman GT4:2020-2023", "Cayman Style Edition:2023-2025", "Cayman GT4 RS:2022-2025"],
  "911": [
    "Carrera:2020-", "Carrera T:2023-", "Carrera S:2020-2024", "Carrera S:2026-", "Carrera 4:2020-2024", "Carrera 4S:2020-2024", "Carrera 4S:2026-",
    "Carrera GTS:2022-", "Carrera 4 GTS:2022-", "Turbo:2021-2024", "Turbo S:2021-2024", "Turbo S:2026-",
    "GT3:2022-", "GT3 Touring:2022-", "GT3 RS:2023-2025", "S/T:2024", "Sport Classic:2023", "Dakar:2023-2024", "Turbo 50 Years:2025", "Spirit 70:2026",
  ],
  "911 Cabriolet": ["Carrera:2020-", "Carrera T:2025-", "Carrera S:2020-2024", "Carrera S:2026-", "Carrera 4:2020-2024", "Carrera 4S:2020-2024", "Carrera 4S:2026-", "Carrera GTS:2022-", "Carrera 4 GTS:2022-", "Turbo:2021-2024", "Turbo S:2021-2024", "Turbo S:2026-"],
  "911 Targa": ["Targa 4:2021-2024", "Targa 4S:2021-2024", "Targa 4S:2026-", "Targa 4 GTS:2022-", "Targa 4S Heritage Design Edition:2021"],
  "Panamera": [
    "Panamera:2020-", "Panamera 4:2020-", "Panamera 4S:2020-2023", "Panamera GTS:2020-2023", "Panamera GTS:2025-", "Panamera Turbo:2020", "Panamera Turbo S:2021-2023",
    "Panamera 4 E-Hybrid:2020-2023", "Panamera 4 E-Hybrid:2025-", "Panamera 4S E-Hybrid:2021-", "Panamera Turbo E-Hybrid:2024-", "Panamera Turbo S E-Hybrid:2020-2023", "Panamera Turbo S E-Hybrid:2025-",
  ],
  "Panamera Sport Turismo": ["Panamera 4:2020-2023", "Panamera 4S:2020-2023", "Panamera GTS:2020-2023", "Panamera Turbo:2020", "Panamera Turbo S:2021-2023", "Panamera 4 E-Hybrid:2020-2023", "Panamera 4S E-Hybrid:2021-2023", "Panamera Turbo S E-Hybrid:2020-2023"],
  "Taycan": ["Taycan:2021-", "Taycan 4:2025-", "Taycan 4S:2020-", "Taycan GTS:2022-", "Taycan Turbo:2020-", "Taycan Turbo S:2020-", "Taycan Turbo GT:2025-", "Taycan Turbo GT Weissach:2025-"],
  "Taycan Cross Turismo": ["Taycan 4 Cross Turismo:2021-", "Taycan 4S Cross Turismo:2021-", "Taycan Turbo Cross Turismo:2021-", "Taycan Turbo S Cross Turismo:2021-"],
  "Taycan Sport Turismo": ["Taycan GTS Sport Turismo:2022-"],
  "Macan": ["Macan:2020-2026", "Macan T:2023-2026", "Macan S:2020-2026", "Macan GTS:2020-2026", "Macan Turbo:2020-2021"],
  "Macan Electric": ["Macan Electric:2025-", "Macan 4 Electric:2024-", "Macan 4S Electric:2025-", "Macan GTS Electric:2026-", "Macan Turbo Electric:2024-"],
  "Cayenne": ["Cayenne:2020-", "Cayenne S:2020-", "Cayenne E-Hybrid:2020-", "Cayenne S E-Hybrid:2024-", "Cayenne GTS:2021-2023", "Cayenne GTS:2025-", "Cayenne Turbo:2020-2023", "Cayenne Turbo S E-Hybrid:2020-2023", "Cayenne Turbo E-Hybrid:2024-"],
  "Cayenne Coupe": [
    "Cayenne Coupe:2020-", "Cayenne S Coupe:2020-", "Cayenne E-Hybrid Coupe:2020-", "Cayenne S E-Hybrid Coupe:2024-", "Cayenne GTS Coupe:2021-2023", "Cayenne GTS Coupe:2025-",
    "Cayenne Turbo Coupe:2020-2023", "Cayenne Turbo S E-Hybrid Coupe:2020-2023", "Cayenne Turbo GT:2022-2025", "Cayenne Turbo E-Hybrid Coupe:2024-",
  ],
  "Cayenne Electric": ["Cayenne Electric:2026-", "Cayenne S Electric:2026-", "Cayenne Turbo Electric:2026-"],
};

const CATALOGS: { match: RegExp; label: string; lineup: Lineup }[] = [
  { match: /merced/i, label: "Mercedes-Benz", lineup: MERCEDES },
  { match: /porsche/i, label: "Porsche", lineup: PORSCHE },
];

export interface FactoryRow { year: number; model: string; trim: string; sort_order: number }

// Every year/model/trim row of the factory lineup for this brand, or null when there isn't one.
export function factoryCatalog(brand: string | null | undefined): { label: string; rows: FactoryRow[] } | null {
  const c = CATALOGS.find((x) => x.match.test(brand || ""));
  if (!c) return null;
  const rows: FactoryRow[] = [];
  const seen = new Set<string>();
  Object.entries(c.lineup).forEach(([model, trims], mi) => {
    for (const spec of trims) {
      const cut = spec.lastIndexOf(":");
      const trim = spec.slice(0, cut);
      const [a, b] = spec.slice(cut + 1).split("-");
      const from = Math.max(FIRST, Number(a));
      const to = Math.min(LAST, b === undefined ? Number(a) : b === "" ? LAST : Number(b));
      for (let y = from; y <= to; y++) {
        const k = `${y}|${model}|${trim}`;
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push({ year: y, model, trim, sort_order: (mi + 1) * 10 });
      }
    }
  });
  return { label: c.label, rows };
}
