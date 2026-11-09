// Pure theme definitions (safe to import from client components).

export interface BrandTheme {
  bg: string; surface: string; surface2: string; surfaceHi: string; stroke: string; strokeSoft: string;
  text: string; text2: string; text3: string; accent: string; accentBright: string; accentDim: string; warn: string;
  displayFont: string; bodyFont: string; paperInk: string; paperAccent: string;
}
// Land Rover values double as the fallback so the portal can never render un-themed.
export const DEFAULT_THEME: BrandTheme = {
  bg: "#0C1A14", surface: "#142922", surface2: "#1B3329", surfaceHi: "#234538", stroke: "#2A4A3A", strokeSoft: "#1F3A2D",
  text: "#F7F4ED", text2: "#9AA89F", text3: "#6B7A70", accent: "#B89968", accentBright: "#D9C29A", accentDim: "#8A7752", warn: "#C4856A",
  displayFont: "Cormorant Garamond", bodyFont: "Inter", paperInk: "#0C1A14", paperAccent: "#8A7752",
};

// White Glove Auto's own admin look: off-black, white, baby-blue accent.
export const WGA_THEME: BrandTheme = {
  bg: "#141517", surface: "#1B1D20", surface2: "#222529", surfaceHi: "#2B2F34", stroke: "#2F3338", strokeSoft: "#26292D",
  text: "#F5F6F8", text2: "#A7ADB5", text3: "#6F757D", accent: "#8EC5E8", accentBright: "#BFE0F5", accentDim: "#5F93B4", warn: "#E0A26B",
  displayFont: "Manrope", bodyFont: "Inter", paperInk: "#141517", paperAccent: "#5F93B4",
};

// CSS custom properties for a theme (names match globals.css).
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0).join(",");
};

// If the web font hasn't loaded (or fails), fall back to the same kind of face: serif brands stay serif, sans stay sans.
const displayFallback = (font: string) =>
  /garamond|playfair|baskerville|bodoni|didot|georgia|lora|merriweather|crimson|cormorant|serif/i.test(font) && !/sans/i.test(font) ? "Georgia,serif" : "system-ui,-apple-system,'Helvetica Neue',sans-serif";

export function themeCss(t: BrandTheme): string {
  return `:root{--gold-rgb:${rgb(t.accent)};--bg-rgb:${rgb(t.bg)};--surface-rgb:${rgb(t.surface)};--bg:${t.bg};--surface:${t.surface};--surface-2:${t.surface2};--surface-hi:${t.surfaceHi};--stroke:${t.stroke};--stroke-soft:${t.strokeSoft};--text:${t.text};--text-2:${t.text2};--text-3:${t.text3};--gold:${t.accent};--gold-bright:${t.accentBright};--gold-dim:${t.accentDim};--warn:${t.warn};--font-display:'${t.displayFont}',${displayFallback(t.displayFont)};--font-body:'${t.bodyFont}',system-ui,sans-serif;--paper-ink:${t.paperInk};--paper-accent:${t.paperAccent};}`;
}

export function fontHref(t: BrandTheme): string {
  const fam = (f: string) => f.trim().replace(/ /g, "+");
  const set = new Set([t.displayFont, t.bodyFont]);
  return `https://fonts.googleapis.com/css2?${Array.from(set).map((f) => `family=${fam(f)}:ital,wght@0,400;0,500;0,600;0,700;1,400`).join("&")}&display=swap`;
}
