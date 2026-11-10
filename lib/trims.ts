// A readable trim order for the vehicle picker: base → top, specials last. Unknown trims sort by name.
const LADDER = [
  "s", "se", "dynamic se", "x-dynamic se", "hse", "dynamic hse", "x-dynamic hse", "metropolitan",
  "autobiography", "outbound", "v8", "sv", "octa",
];
const rank = (t: string) => {
  const i = LADDER.indexOf(t.trim().toLowerCase());
  return i === -1 ? LADDER.length : i;
};
export const trimOrder = (a: string, b: string) => rank(a) - rank(b) || a.localeCompare(b);
