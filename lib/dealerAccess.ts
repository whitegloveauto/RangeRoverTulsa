import { kvGet, kvSet } from "@/lib/kv";

// What each person at a dealership can see and do. Dealer admins always have everything;
// for everyone else it's the dealership's defaults (chosen in setup) plus any per-person changes.
// Stored as one JSON document per dealership in dealer_program_settings (no schema change).

export interface DealerAccess {
  see_cost: boolean; // White Glove's price to the dealership + margin
  see_all_orders: boolean; // everyone's quotes/orders, not just their own
  master_sheet: boolean; // the all-models master price sheet
  comebacks: boolean; // file and follow comebacks
}
export type AccessKey = keyof DealerAccess;

export const ACCESS_QUESTIONS: { key: AccessKey; label: string; question: string; help: string }[] = [
  { key: "see_cost", label: "See our cost & margin", question: "Should they see your cost and margin?", help: "White Glove's price to the dealership and the margin on every package, quote and order. Off = they only see customer prices." },
  { key: "see_all_orders", label: "See everyone's orders", question: "Should they see everyone's orders?", help: "Off = they only see the quotes and orders they wrote themselves." },
  { key: "master_sheet", label: "Use the master price sheet", question: "Should they get the master price sheet?", help: "The every-model price sheet. They can always print a sheet for the car they're quoting." },
  { key: "comebacks", label: "File comebacks", question: "Should they be able to file comebacks?", help: "Report an issue on a past job straight to White Glove Auto." },
];

export const FULL_ACCESS: DealerAccess = { see_cost: true, see_all_orders: true, master_sheet: true, comebacks: true };

export interface AccessDoc {
  defaults?: Partial<DealerAccess>;
  users?: Record<string, Partial<DealerAccess>>;
  profiles?: Record<string, { title?: string; phone?: string }>;
  setup?: { done: boolean; at: string; by: string };
}

const key = (dealershipId: string) => `dealer-access:${dealershipId}`;
export const getAccessDoc = (dealershipId: string) => kvGet<AccessDoc>(key(dealershipId), {});
export const saveAccessDoc = (dealershipId: string, doc: AccessDoc) => kvSet(key(dealershipId), doc);

export function defaultAccess(doc: AccessDoc, legacyHideCost = false): DealerAccess {
  // Before setup: sales see customer prices per the old dealership switch, and only their own orders.
  return { ...FULL_ACCESS, see_cost: !legacyHideCost, see_all_orders: false, ...(doc.defaults || {}) };
}

export function resolveAccess(doc: AccessDoc, userId: string | null, role: "admin" | "user", legacyHideCost = false): DealerAccess {
  if (role === "admin") return { ...FULL_ACCESS };
  return { ...defaultAccess(doc, legacyHideCost), ...((userId && doc.users?.[userId]) || {}) };
}

// Can this session open this quote/order? (admins + "see everyone's orders" → any; others → their own)
export function canViewQuote(s: { role: string; userId: string | null; access?: DealerAccess }, q: { dealer_user_id?: string | null }) {
  if (s.role === "admin" || !s.userId || s.access?.see_all_orders) return true;
  return q.dealer_user_id === s.userId;
}

// Strip White Glove's numbers for people who shouldn't see them.
export function hideCost<T extends Record<string, any>>(q: T): T {
  const lines = Array.isArray(q.line_items) ? q.line_items.map((l: any) => { const { cost, ...rest } = l || {}; return rest; }) : q.line_items;
  return { ...q, cost_total: null, gross_total: null, line_items: lines };
}

export function cleanAccess(input: any): Partial<DealerAccess> {
  const out: Partial<DealerAccess> = {};
  for (const q of ACCESS_QUESTIONS) if (typeof input?.[q.key] === "boolean") out[q.key] = input[q.key];
  return out;
}


// The dealership never sees WGA's billing steps: "invoiced" (work done, awaiting payment) reads as
// complete on their side, and WGA marking it paid isn't a separate event for them.
export const dealerStatus = (s: string) => (s === "invoiced" ? "complete" : s);
export function dealerEvents<T extends { from_status?: string | null; to_status?: string | null }>(events: T[]): T[] {
  return events
    .filter((e) => !(e.from_status === "invoiced" && e.to_status === "complete"))
    .map((e) => ({ ...e, from_status: e.from_status ? dealerStatus(e.from_status) : e.from_status, to_status: e.to_status ? dealerStatus(e.to_status) : e.to_status }));
}
