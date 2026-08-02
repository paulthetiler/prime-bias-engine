-- PrimeBias Engine — auto-save de-duplication key for bias_analysis.
--
-- Background: the Bias Tool auto-saves a running "analysis log" row while you
-- edit. Previously it inserted a fresh row on every change (and a later fix used
-- update-with-insert-fallback in the frontend, which could still recreate a
-- duplicate if an update failed transiently). This migration lets the auto-save
-- upsert deterministically so the invariant is enforced by the database:
--
--   «One analysis session (analysis_id) can have at most one bias_analysis row
--    per user.»
--
-- How to apply:
--   Option A (dashboard): Supabase project → SQL Editor → paste → Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety on existing installs:
--   * `analysis_id` is a NEW nullable column, so every pre-existing row gets
--     NULL. A unique index treats NULLs as DISTINCT, so legacy/imported rows
--     (which have no analysis_id) never collide with each other or with new
--     rows — there are no existing duplicates to clean up before the index is
--     created, and the CREATE cannot fail on current data.
--   * Re-runnable: both statements use IF NOT EXISTS.

-- 1. The deterministic session key the frontend supplies on each auto-save.
alter table public.bias_analysis
  add column if not exists analysis_id text;

-- 2. Enforce one row per (user, analysis session). A full (non-partial) unique
--    index is used deliberately: Postgres treats NULL analysis_id values as
--    distinct, so unlimited legacy NULL rows remain valid, while the frontend's
--    upsert can infer this index via ON CONFLICT (user_id, analysis_id).
create unique index if not exists bias_analysis_user_analysis_key
  on public.bias_analysis (user_id, analysis_id);
