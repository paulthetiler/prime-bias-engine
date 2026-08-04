-- PrimeBias Engine — immutable engine snapshot & versioning.
--
-- Guarantees that every newly completed trade permanently retains the EXACT
-- Prime Bias calculation and the settings that produced it, so a historical
-- trade is never silently re-graded when the user later changes engine settings
-- (weights, thresholds, advanced toggles) or when the engine maths itself is
-- corrected in a future release.
--
-- What each column holds:
--   * engine_version      — stable identifier of the engine implementation used
--                           (e.g. 'prime-bias-current-v1'). Bumped whenever the
--                           engine maths, weights, thresholds, caps or block
--                           rules change.
--   * engine_settings     — the RESOLVED options actually applied for this trade
--                           (score weights, grade thresholds, advanced toggles)
--                           captured as concrete values, never a reference to the
--                           user's mutable settings.
--   * raw_grade           — the grade BEFORE the block-trend cap (Excel AC35),
--                           stored separately from the effective/capped grade in
--                           the existing `grade` column.
--   * buy_score /         — the BUY vs SELL point tallies behind the winning
--     sell_score            score (already in the existing `score` column).
--   * timeframes_snapshot — per-timeframe calculated results + the raw indicator
--                           inputs, so a breakdown never has to be recomputed.
--   * lights_result       — the extra-check (red-light/green-light) outcome.
--
-- How to apply:
--   Option A (dashboard): Supabase project -> SQL Editor -> paste -> Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety: additive and re-runnable (IF NOT EXISTS). Every new column is nullable,
-- so all pre-existing rows keep working. A row with NULL engine_version is a
-- LEGACY trade taken before snapshots existed — the app reads it as-is and never
-- recalculates its grade. No existing column is altered or dropped.

alter table public.completed_trade
  add column if not exists engine_version      text,
  add column if not exists engine_settings     jsonb,
  add column if not exists raw_grade           text,
  add column if not exists buy_score           numeric,
  add column if not exists sell_score          numeric,
  add column if not exists timeframes_snapshot jsonb,
  add column if not exists lights_result       text;
