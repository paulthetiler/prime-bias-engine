# PrimeBias Engine

A React + Vite trading-bias PWA. Originally built on Base44, now running on
**Supabase** (Postgres + Auth) so it can be developed and hosted anywhere.

## Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) project

## 1. Install

```bash
npm install
```

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor** and run each file in
   [`supabase/migrations/`](supabase/migrations/) **in order** (`0001_init.sql`,
   `0002_bias_analysis_autosave_key.sql`, `0003_cross_device_active_sync.sql`,
   then `0004_financial_model.sql`). `0001` creates the four tables
   (`bias_analysis`, `completed_trade`, `monthly_journal`, `trade_journal_entry`)
   with per-user Row Level Security; `0002` adds the auto-save de-duplication key;
   `0003` adds the columns that make an active analysis a complete, rehydratable
   snapshot so the **Summary and Bias Tool sync across devices** (without it, the
   Bias Tool shows "Not saved" and a second device loads an empty Summary);
   `0004` adds the **account-led financial model** — `trading_account` and
   `account_transaction` tables plus the `completed_trade` money columns
   (`account_id`, `gross_pnl`, `fees`, `net_pnl`, `amount_risked`) that power
   Net P/L, ROI, profit factor and the account balance / equity curve. See
   [`docs/financial-model.md`](docs/financial-model.md).
   (Or, with the CLI: `supabase db push`.)
3. In **Project Settings → API**, copy your **Project URL** and **anon/public key**.

## 3. Configure env vars

```bash
cp .env.example .env
```

Then fill in:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

## 4. Run

```bash
npm run dev
```

Open the app, **Sign up** with an email + password (first run creates your
account), then sign in. Data syncs to your Supabase project, so the same account
works across your phone and desktop.

> **Email confirmation:** by default Supabase asks new users to confirm their
> email. For a personal single-user app you can turn this off under
> **Authentication → Providers → Email → Confirm email** so sign-up logs you
> straight in.

## Migrating your data from Base44

1. In your old Base44-hosted app, open **Settings → Backup / Export** and
   download the JSON backup.
2. In this app (after signing in), open **Settings → Import / Restore** and
   select that JSON file. It upserts every trade, journal and analysis into your
   Supabase account and restores local settings. Re-running it is safe.

## Scripts

| Command             | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Start the dev server           |
| `npm run build`     | Production build to `./dist`   |
| `npm run preview`   | Preview the production build   |
| `npm run lint`      | Lint                           |

## Where things live

- `src/api/supabaseClient.js` — creates the Supabase client from env vars.
- `src/api/base44Client.js` — the data + auth layer. Keeps the historical
  `base44` export name (`{ auth, entities }`) but is fully Supabase-backed; no
  Base44 code remains. Rename freely.
- `src/lib/AuthContext.jsx` / `src/components/Login.jsx` — auth state + sign-in UI.
- `supabase/migrations/` — database schema.
