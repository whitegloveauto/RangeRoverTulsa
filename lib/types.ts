// Types that mirror the Supabase schema (dealer program v2).

export interface Dealership {
  id: string;
  slug: string;
  name: string;
  brand: string;
  location: string | null;
  billing_terms: number;
  active: boolean;
  hide_cost_from_users: boolean;
}

export interface DealerService {
  product_name?: string | null; // e.g. XPEL ULTIMATE PLUS™ (customer packet)
  blurb?: string | null;
  facts?: string[];
  id: string;
  brand: string;
  key: string;
  name: string;
  note: string | null;
  sort_order: number;
  active: boolean;
  group?: string | null; // "pick one" group shared with other services (e.g. PPF Clear + Stealth)
}

export interface DealerServiceItem {
  id: string;
  service_id: string;
  name: string;
  description: string | null;
  blurb?: string | null;
  coverage?: string | null; // "what's included", printed on customer documents (see lib/coverage)
  sort_order: number;
  active: boolean;
}

// One cell of the pricing grid for a given model + item.
export interface ModelPrice {
  cost: number | null; // what WGA charges the dealership (null = not priced yet)
  suggested_retail: number | null;
  retail: number | null; // the dealership's own customer price (falls back to suggested)
}

// Fully assembled pricing for one dealership, keyed by model then item id.
export interface PricingBook {
  dealership?: { id: string; name: string; brand: string };
  brand: string;
  models: string[];
  services: (DealerService & { items: DealerServiceItem[] })[];
  prices: Record<string, Record<string, ModelPrice>>;
  canSeeCost: boolean;
}

export interface VehicleCatalog {
  // year -> model -> trims[]
  years: number[];
  byYear: Record<number, Record<string, string[]>>;
}

// Quote / order line item (snapshot at time of order)
export interface OrderLine {
  item_id: string;
  service: string;
  name: string;
  cost: number;
  retail: number;
}

export interface DealerUser {
  id: string;
  dealership_id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
}

// The session payload encoded into the JWT.
export interface SessionClaims {
  kind: "dealer" | "wga";
  dealershipId: string; // "" for wga sessions
  slug: string;
  name: string; // dealership name (dealer) or "White Glove Auto" (wga)
  brand: string;
  location: string | null;
  userId: string | null;
  userName: string;
  userEmail: string;
  role: "admin" | "user"; // dealer admin/user, or wga admin/user(team)
  canSeeCost: boolean;
  viewAs?: string | null; // set when a WGA admin is viewing the dealer side as this dealership
  perms?: string[]; // WGA sessions: what this person can see (admins implicitly have all)
  access?: import("./dealerAccess").DealerAccess; // dealer sessions: resolved live on every request
  needsSetup?: boolean; // dealer admin who hasn't finished first-time setup
}
