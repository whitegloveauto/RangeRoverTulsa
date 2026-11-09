import { kvGet, kvSet } from "./kv";

// "Pick one" groups: services in the same group share a single choice. Every service is already
// pick-one on its own; a group links several services (e.g. PPF Clear + PPF Stealth) so picking
// in one clears the others. Stored per brand catalog as { serviceId: groupName } ("" = no group).
// Until WGA sets one, paint protection film services are grouped automatically.

export const PPF_RE = /\bppf\b|paint protection|stealth|clear ?bra|ultimate plus/i;
export const DEFAULT_PPF_GROUP = "Paint protection film";

const key = (brand: string) => `pick-one:${brand}`;

export async function getGroupOverrides(brand: string): Promise<Record<string, string>> {
  return kvGet<Record<string, string>>(key(brand), {});
}

export function groupFor(s: { id: string; key?: string | null; name: string; product_name?: string | null }, overrides: Record<string, string>): string | null {
  if (Object.prototype.hasOwnProperty.call(overrides, s.id)) return overrides[s.id] || null;
  return PPF_RE.test(`${s.key || ""} ${s.name} ${s.product_name || ""}`) ? DEFAULT_PPF_GROUP : null;
}

export async function setGroup(brand: string, serviceId: string, group: string) {
  const o = await getGroupOverrides(brand);
  o[serviceId] = group.trim().slice(0, 60);
  return kvSet(key(brand), o);
}

// First conflict in a set of picked lines, as a message — or null if every group has one pick.
export function pickOneConflict(
  lines: { item_id: string }[],
  services: { id: string; name: string; group?: string | null; items: { id: string }[] }[]
): string | null {
  const svcOf = new Map<string, (typeof services)[number]>();
  for (const s of services) for (const it of s.items) svcOf.set(it.id, s);
  const seen = new Map<string, string>(); // group key → service name of the first pick
  for (const l of lines) {
    const s = svcOf.get(l.item_id);
    if (!s) continue;
    const g = s.group ? `g:${s.group}` : `s:${s.id}`;
    if (seen.has(g)) {
      if (!s.group || seen.get(g) === s.name) return `Pick one option under ${s.name}.`;
      const names = services.filter((x) => x.group === s.group).map((x) => x.name);
      return `Pick one ${s.group.toLowerCase()} option — ${names.join(" or ")}, not both.`;
    }
    seen.set(g, s.name);
  }
  return null;
}
