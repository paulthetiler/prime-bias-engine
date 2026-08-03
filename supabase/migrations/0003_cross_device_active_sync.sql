-- PrimeBias Engine — cross-device sync for active (in-progress) analyses.
--
-- Background: the Summary and Bias Tool render the user's active analyses.
-- Historically those lived ONLY in browser localStorage, so opening the app on
-- a second device (same account) showed an empty state — the data was never in
-- the database in a rehydratable form. The auto-save row (migration 0002) only
-- stored a summary (bias/grade/action) and never the raw `inputs`, so a Summary
-- card — which is computed from `inputs` — could not be rebuilt from it.
--
-- This migration adds the two columns needed to make the auto-save row a
-- COMPLETE, rehydratable snapshot and to link a completed trade back to the
-- analysis it came from, so other devices can tell which analyses are still
-- active vs. already completed.
--
--   * bias_analysis.extra_check   — the {h1, m15} "extra check" state, so a
--                                   hydrated card recomputes identically.
--     (bias_analysis.inputs and bias_analysis.results already exist from 0001;
--      the frontend now populates them.)
--   * completed_trade.analysis_id — the analysis_id (session key) the trade was
--                                   completed from. Hydration uses this to hide
--                                   analyses that were completed on another
--                                   device instead of resurrecting them.
--
-- How to apply:
--   Option A (dashboard): Supabase project → SQL Editor → paste → Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety: additive and re-runnable (IF NOT EXISTS). New columns are nullable,
-- so every pre-existing row keeps working; older completed_trade rows simply
-- have a NULL analysis_id (they are matched to nothing, which is correct).

-- 1. Full-snapshot column for the auto-save row.
alter table public.bias_analysis
  add column if not exists extra_check jsonb;

-- 2. Link a completed trade to the analysis session it came from.
alter table public.completed_trade
  add column if not exists analysis_id text;

-- 3. Cheap lookup of "which analyses have been completed" during hydration.
create index if not exists completed_trade_user_analysis_idx
  on public.completed_trade (user_id, analysis_id);
