// Types that mirror the Supabase schema (0001_dealer_portal_init.sql).

export interface Dealership {
  id: string;
  slug: string;
  name: string;
  brand: string;
  location: string | null;
  billing_terms: number;
  active: boolean;
}

export interface PackageItem {
  name: string;
  retail: number;
  cost: number;
}

export interface ProtectionPackage {
  id: string;
  brand: string;
  tier: string; // ESSENTIAL / SIGNATURE / ESTATE / ROYAL
  tier_order: number;
  tier_index: string; // I / II / III / IV
  items: PackageItem[];
  retail_total: number;
  cost_total: number;
  gross_total: number;
}

export interface AlacarteItem {
  id: string;
  item_key: string;
  group_label: string;
  group_order: number;
  item_order: number;
  name: string;
  retail: number;
  cost: number;
}

export interface VehicleCatalog {
  // year -> model -> trims[]
  years: number[];
  byYear: Record<number, Record<string, string[]>>;
}

// The session payload encoded into the JWT.
export interface SessionClaims {
  dealershipId: string;
  slug: string;
  name: string;
  brand: string;
  location: string | null;
}

// Shape returned by /api/pricing
export interface PricingResponse {
  packages: ProtectionPackage[];
  alacarte: AlacarteItem[];
  tintUpgrade: { retail: number; cost: number };
}
