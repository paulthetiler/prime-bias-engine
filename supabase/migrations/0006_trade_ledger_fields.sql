-- PrimeBias Engine — realised-trade ledger fields (Wage Maker integration, phase 3).
--
-- Adds the missing realised-trade columns needed to represent the useful data
-- from the Wage Maker journal workbook, WITHOUT changing any existing column or
-- how the engine works. Schema + compatibility only — no UI, no backfill.
--
-- New columns on completed_trade:
--   * position_size   — the actual bid / lot / point-value used for the trade.
--   * points_pips     — the explicitly recorded movement result (may be +, - or 0).
--                       NEVER auto-derived from net_pnl / position_size here.
--   * split_count     — number of split positions that make up the trade (>= 1).
--   * mood            — the trader's recorded mood.
--   * reason_tags     — setup / reason tags. Nullable jsonb (matching the existing
--                       jsonb convention in this schema: inputs_snapshot, rules,
--                       warnings, mistake_tags and lesson_tags all default NULL,
--                       so reason_tags is left nullable with NO default too).
--   * trade_direction — the direction ACTUALLY taken ('long' / 'short').
--
-- Why a separate trade_direction column:
--   The existing `direction` column stores the Prime Bias ENGINE recommendation
--   (results.mainDirection = 'BUY' / 'SELL', written in lib/tradeCompletion.js),
--   not necessarily the side the user actually executed. Its meaning must not
--   change, so the executed direction gets its own nullable column. Legacy rows
--   leave it NULL — we do not assume the engine recommendation was taken.
--
-- How to apply:
--   Option A (dashboard): Supabase project -> SQL Editor -> paste -> Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety: additive, nullable, re-runnable (IF NOT EXISTS + guarded constraints).
-- No existing column is dropped, renamed or repurposed; no data is backfilled.
-- All CHECK constraints tolerate NULL, so every pre-existing row stays valid.

alter table public.completed_trade
  add column if not exists position_size   numeric,
  add column if not exists points_pips     numeric,
  add column if not exists split_count     integer,
  add column if not exists mood            text,
  add column if not exists reason_tags     jsonb,
  add column if not exists trade_direction text;

-- Validation constraints, added idempotently (a NULL value always passes a CHECK,
-- so existing rows need no backfill):
--   * position_size may be zero or positive, never negative.
--   * split_count is at least 1 when present.
--   * trade_direction is constrained to the two executed sides.
--   * points_pips is intentionally unconstrained (negative results are valid).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completed_trade'::regclass
      and conname = 'completed_trade_position_size_check'
  ) then
    alter table public.completed_trade
      add constraint completed_trade_position_size_check
      check (position_size is null or position_size >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completed_trade'::regclass
      and conname = 'completed_trade_split_count_check'
  ) then
    alter table public.completed_trade
      add constraint completed_trade_split_count_check
      check (split_count is null or split_count >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.completed_trade'::regclass
      and conname = 'completed_trade_trade_direction_check'
  ) then
    alter table public.completed_trade
      add constraint completed_trade_trade_direction_check
      check (trade_direction is null or trade_direction in ('long', 'short'));
  end if;
end;
$$;
