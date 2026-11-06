"use client";

import { WGA_THEME, themeCss } from "@/lib/theme";

// Type + chrome tweaks that only apply to the WGA side (sans display, no italics, blue focus rings).
const WGA_EXTRA = `
.stage-title, .login-title, .drawer-title, h3 { font-style: normal !important; font-weight: 600; letter-spacing: -0.02em; }
.login-title { font-weight: 600; }
.btn-primary { color: #0F1416; font-weight: 600; }
input:focus, select:focus, textarea:focus { border-color: var(--gold) !important; box-shadow: 0 0 0 3px rgba(142,197,232,0.18); }
.ambient { opacity: 0.25; }
`;

// White Glove Auto's own look for the admin side (off-black / white / baby blue).
export default function WgaTheme() {
  return <style dangerouslySetInnerHTML={{ __html: themeCss(WGA_THEME) + WGA_EXTRA }} />;
}
