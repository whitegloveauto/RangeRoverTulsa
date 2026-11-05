# Dealer Program v2 — what changed (Nov 2026)

## New in this update
- **Per-model pricing** for every service (PPF, Ceramic, Window Tint, Windshield Protection Film).
  WGA sets cost + suggested retail per model; the dealership sets its own retail on top.
- **White Glove admin side** at `/wga` (sign in with your WGA portal email + password):
  - `/wga/pricing` — edit cost + suggested retail, rename/add/hide packages and services
  - `/wga/orders` — every submitted order, status pipeline, assign, schedule, notes
  - `/wga/dealerships` — dealership logins, passwords, cost visibility
- **Dealership logins** (email + password, admin or sales). The old shared password still works
  and signs in as a dealer admin. Dealer admins: `/portal/settings` (their prices, team, hide-cost).
- **Printable sheets**: per-vehicle (`/portal/sheet`, also linked from the pricing page) and master (`/portal/master`).
- **Push alert** to WGA Command (admins + dealer_deals access) on every submitted order.

## Database
Migration already applied in Supabase: `dealer_services`, `dealer_service_items`, `dealer_model_pricing`,
`dealer_retail_prices`, `dealer_users`, plus new columns on `dealer_dealerships` and `dealer_quotes`.
The old `dealer_packages` / `dealer_alacarte_catalog` tables are left in place but no longer used.

## Env vars (unchanged)
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` — already set on the Netlify site.

## First logins
- Dealer admin (temporary): `admin@rangerovertulsa.local` / `RangeRover-Admin-2026` — change it in Settings → Team logins,
  or add the real managers under WGA → Dealerships and disable this one.
- WGA side: any `profiles` admin, or a team member with Dealer Deals access.

## v2.1 — ShopMonkey + Vehicles
- Submitting an order now creates the ShopMonkey RO automatically (edge function `dealer-order-sm`); RO # shows on the dealer confirmation, in the push alert title, and in /wga/orders (with a "Create RO now" retry if it failed).
- New WGA admin tab /wga/vehicles: add model years (copy previous year), add/rename/hide models, add/hide/delete trims.
