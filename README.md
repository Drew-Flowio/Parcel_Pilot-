# Parcel Pilot

A targeted property lead-list cockpit for small and mid-sized property management
companies. Connects to a Supabase Postgres database (the `parcels` table) and
helps PMs identify and prioritize the highest-value opportunities — absentee
owners, long-vacant buildings, and small-to-mid multifamily assets — and track
outreach.

This is **V1, single-tenant, no auth**. Run it behind a VPN, on localhost, or
behind any external auth proxy you already trust.

---

## Architectural overview

- **Next.js 14 (App Router) + React + TypeScript + Tailwind CSS.**
- **Supabase Postgres** as the only data store. All queries go through a
  server-side client using the service-role key — the browser never sees it.
- **Server-rendered dashboard** (`app/page.tsx`) reads the URL search params,
  runs a single Supabase query, and hands the results to a client `Cockpit`
  component for interactive filtering.
- **Filter changes** debounce by ~300 ms, hit `/api/parcels` for fresh rows, and
  sync into the URL so views are shareable.
- **Desirability scoring** lives in two mirrored places:
  - `supabase/schema.sql` — `calculate_desirability_score(...)` SQL function +
    `BEFORE INSERT/UPDATE` trigger that recomputes the score on every write.
  - `lib/desirability.ts` — TypeScript mirror that returns a per-factor
    breakdown for the detail drawer ("+25 absentee owner, +20 long vacant, …").
- **Three view slices** (`top`, `high_value`, `small_juicy`) are presets layered
  on top of the regular filters in `lib/parcelQuery.ts`.
- **Contact actions** (`SMS / Email / Log Call`) update `contact_status`,
  `contacted_via`, and `last_contacted_at`. SMS/email sends are stubbed —
  there's a clearly marked integration point in `app/api/parcels/contact/route.ts`
  for Twilio / Resend / SendGrid.
- **CSV export** streams either the currently filtered list or the selected
  rows from `app/api/parcels/export/route.ts`.

### Project structure

```
parcel-pilot/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   ├── page.tsx                      # Main cockpit dashboard (server component)
│   ├── parcel/[id]/
│   │   ├── page.tsx                  # Deep-link parcel detail
│   │   └── ParcelDetailClient.tsx
│   └── api/parcels/
│       ├── route.ts                  # GET filtered parcels (for client refetches)
│       ├── [id]/route.ts             # GET / PATCH single parcel
│       ├── export/route.ts           # CSV download
│       └── contact/route.ts          # SMS / email / call action
├── components/
│   ├── ui/
│   │   ├── Logo.tsx                  # Cessna-over-skyline mark + wordmark
│   │   └── Primitives.tsx            # Card, Button, Input, Select, Badge, etc.
│   └── parcel/
│       ├── Cockpit.tsx               # Owns filter state, URL sync, fetching
│       ├── ParcelViewToggle.tsx      # Top / High Value / Small but Juicy
│       ├── ParcelFilters.tsx         # Left filter panel
│       ├── ParcelTable.tsx           # Main results table
│       └── ParcelDetailDrawer.tsx    # Right-side detail + score breakdown
├── lib/
│   ├── types.ts
│   ├── supabaseClient.ts             # Server-side service-role client
│   ├── desirability.ts               # TS mirror of SQL scoring + breakdown
│   ├── csv.ts
│   └── parcelQuery.ts                # parseFilters + applyFilters
├── supabase/
│   └── schema.sql                    # Table, scoring fn, trigger, seed rows
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.js
└── .env.local.example
```

---

## Desirability scoring (0–100)

| Factor                            | Max points | Notes                                                 |
| --------------------------------- | ---------- | ----------------------------------------------------- |
| Absentee ownership                | +25        | Mailing address differs from property address         |
| Vacancy status                    | +20        | `vacant_long` strongest, `partially_vacant` mid       |
| Days vacant bonus                 | +5         | ≥180 days = +5, ≥60 days = +3                          |
| Unit-count sweet spot             | +20        | 4–80 units ideal; SFH penalized; >150 mostly ignored  |
| Market value band                 | +15        | $500k–$8M ideal; below $200k penalized; above $25M ≈0 |
| Not professionally managed        | +15        | Unknown management = +8 (worth investigating)         |
| Contact: `do_not_contact`         | resets to 0 | Hard zero — never resurface                           |
| Contact: `follow_up`              | +3         | Small bump — already in motion                        |

The trigger recomputes the score on every insert/update so the database is
always the source of truth. The TS mirror in `lib/desirability.ts` is used only
for the human-readable breakdown in the detail drawer.

---

## Setup

### 1. Create a Supabase project
1. Go to <https://supabase.com> → New project.
2. Open the SQL editor and paste the contents of `supabase/schema.sql`. Run it.
   This creates the `parcels` table, scoring function, trigger, indexes, and a
   handful of seed rows.
3. Settings → API → copy the **Project URL** and the **service_role** key.

### 2. Configure environment variables
```bash
cp .env.local.example .env.local
```
Edit `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SMS_PROVIDER_API_KEY=        # optional, stubbed in V1
EMAIL_PROVIDER_API_KEY=      # optional, stubbed in V1
```

> ⚠️ The service-role key bypasses RLS. Since this V1 has no auth, **only run
> Parcel Pilot somewhere that isn't exposed to the public internet** (localhost,
> a VPN, or behind an external auth proxy).

### 3. Install and run
```bash
npm install
npm run dev
```
Visit <http://localhost:3000>.

### 4. Deploy to Vercel
1. Push the repo to GitHub.
2. Import it into Vercel.
3. Add the same env vars (`NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`) in **Project → Settings → Environment Variables**.
4. Deploy.

---

## Where to plug in real outreach

`app/api/parcels/contact/route.ts` contains a `sendStub(...)` function. Swap
the body for a Twilio (SMS) or Resend / SendGrid (email) call, read the relevant
key from `process.env`, and the rest of the flow — status update, "last
contacted" timestamp, UI badge — already works.

---

## V2 notes (not implemented, intentional)

- Multi-tenant orgs + Supabase Auth + RLS policies
- Real SMS/email provider integration
- Bulk "campaign" outreach with templating
- XLSX export
- Map view
