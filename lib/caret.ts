import type { ChangeEvent } from "react";

// For inputs that clean up what's typed (uppercase a VIN, strip symbols, digits only…):
// apply the cleanup but keep the cursor where the person was typing instead of jumping to the end.
export function cleanChange(e: ChangeEvent<HTMLInputElement>, clean: (s: string) => string, set: (v: string) => void) {
  const el = e.target;
  const raw = el.value;
  const pos = el.selectionStart ?? raw.length;
  const next = clean(raw);
  const caret = Math.min(clean(raw.slice(0, pos)).length, next.length);
  set(next);
  if (next !== raw && typeof window !== "undefined") {
    requestAnimationFrame(() => {
      if (document.activeElement === el) {
        try {
          el.setSelectionRange(caret, caret);
        } catch {}
      }
    });
  }
}

export const cleanVin = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
