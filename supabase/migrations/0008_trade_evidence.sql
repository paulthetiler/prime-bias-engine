-- PrimeBias Engine — trade evidence capture (Wage Maker integration, phase 4).
--
-- Adds a place to store pasted broker-history text as EVIDENCE for a completed
-- trade. Screenshots already have a home (completed_trade.screenshot_url); this
-- adds the text counterpart so a user can paste broker output alongside a trade.
--
--   * broker_evidence — raw pasted broker-history text. It is EVIDENCE only:
--       no value is ever auto-extracted from it into the financial ledger. Any
--       future extraction must go through an explicit user-confirmation step
--       before populating money fields.
--
-- How to apply:
--   Option A (dashboard): Supabase project -> SQL Editor -> paste -> Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety: additive, nullable, re-runnable (IF NOT EXISTS). No existing column is
-- altered, dropped or repurposed; no data is backfilled.

alter table public.completed_trade
  add column if not exists broker_evidence text;
