# Dealership Pricing Portal — White Glove Auto

Next.js (App Router) + Supabase + Netlify. Range Rover–branded dealership portal
for pulling XPEL paint protection, ceramic coating, and window film pricing.

Lives at **dealers.whitegloveauto.app**.

---

## Prerequisites

- Node.js 18.17+ (or 20+)
- The Supabase schema already applied (`0001_dealer_portal_init.sql`)
- Your Supabase project URL + service role key

---

## 1 · Install

```bash
cd dealers-portal
npm install
```

## 2 · Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

- `SUPABASE_URL` — Supabase Dashboard → Project Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` — same page → service_role key (keep secret)
- `SESSION_SECRET` — generate one:
  ```bash
  openssl rand -base64 48
  ```

## 3 · Run locally

```bash
npm run dev
```

Open http://localhost:3000

Sign in with the seeded password: **rangerover2026**
(Change it — see "Managing dealerships" below.)

## 4 · Build (sanity check before deploy)

```bash
npm run build
```

---

## Deploy to Netlify

### A · Push to GitHub

```bash
git init
git add .
git commit -m "Dealership pricing portal — initial"
git branch -M main
git remote add origin git@github.com:YOUR-ORG/dealers-portal.git
git push -u origin main
```

### B · Create the Netlify site

1. Netlify → Add new site → Import an existing project → pick the repo
2. Build command and publish dir are auto-detected from `netlify.toml`
3. Add the `@netlify/plugin-nextjs` plugin (auto-installs from `netlify.toml`)

### C · Set environment variables

Netlify → Site settings → Environment variables. Add the same three:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`.

### D · Custom domain

Netlify → Domain management → Add custom domain → `dealers.whitegloveauto.app`.
Add the CNAME record it gives you at your DNS provider.

---

## Managing dealerships

All dealership management is done in Supabase SQL Editor for now.

**Change a password:**
```sql
UPDATE dealer_dealerships
SET password_hash = crypt('new-password', gen_salt('bf', 10))
WHERE slug = 'range-rover-tulsa';
```

**Add a new dealership (same brand):**
```sql
INSERT INTO dealer_dealerships (slug, name, brand, location, password_hash)
VALUES ('range-rover-okc', 'Range Rover · OKC', 'Range Rover',
        'Oklahoma City, Oklahoma',
        crypt('their-password', gen_salt('bf', 10)));
```

**Edit package pricing** (line items live in JSONB):
```sql
UPDATE dealer_packages
SET items = '[{"name":"...","retail":199,"cost":129}]'::jsonb,
    retail_total = 199, cost_total = 129, gross_total = 70
WHERE brand = 'Range Rover' AND tier = 'ESSENTIAL';
```

---

## Architecture notes

- **Auth:** shared password per dealership, bcrypt-hashed in
  `dealer_dealerships.password_hash`. On login, a signed JWT (jose, HS256) goes
  into an httpOnly cookie. 12-hour expiry.
- **Data access:** the browser never touches Supabase directly. Every read/write
  goes through an API route (`/app/api/*`) that validates the session cookie,
  then queries Supabase with the service role key, scoped to the dealership.
- **RLS:** disabled by design (matches the other WGA apps). Scoping is enforced
  in the API layer.
- **Vehicle selection** persists in `sessionStorage` across the vehicle →
  pricing navigation.

## What's next (not yet built)

- Quote PDF generation (currently quotes save to `dealer_quotes`; PDF render is
  a follow-up)
- Admin screen to view saved quotes (data is there; UI pending)
- Live WebConnect proxy for real-time à la carte pricing (currently the à la
  carte catalog is seeded static pricing in `dealer_alacarte_catalog`)
- Multi-brand support via subdomain → slug resolution
