"use client";

import { WGA_THEME, themeCss } from "@/lib/theme";

// Type + chrome tweaks that only apply to the WGA side (sans display, no italics, blue focus rings).
const WGA_EXTRA = `
.stage-title, .login-title, .drawer-title, h3 { font-style: normal !important; font-weight: 600; letter-spacing: -0.02em; }
.oc-vehicle span, .loading-text, .alacarte-title, .picker-summary, .nameplate .trim { font-style: normal !important; }
.login-title { font-weight: 600; }
.btn-primary { color: var(--bg); font-weight: 600; }
input:focus, select:focus, textarea:focus { border-color: var(--gold) !important; box-shadow: 0 0 0 3px rgba(142,197,232,0.18); }
.ambient { opacity: 0.25; }
.status-pill.in_shopmonkey { color: #A7ADB5; border-color: #3A3F45; }
.status-pill.scheduled { color: #BFE0F5; border-color: #5F93B4; }
.status-pill.in_progress { color: #F3C969; border-color: #6E5A2A; }
.status-pill.invoiced { color: #9FE0B4; border-color: #3E7353; }
`;

// White Glove Auto's own look for the admin side (off-black / white / baby blue).
export default function WgaTheme() {
  return <style dangerouslySetInnerHTML={{ __html: themeCss(WGA_THEME) + WGA_EXTRA }} />;
}
