-- PrimeBias Engine — broker-import execution details on completed trades.
--
-- The Add Result flow can now import a trade's result straight from a broker
-- (screenshot OCR or pasted history) instead of the user re-typing it. To store
-- everything an import extracts — and to stop the same broker trade being
-- imported twice — completed_trade gains a few columns:
--
--   * position_size — traded size / volume / lots.
--   * opened_at / closed_at — the broker's own open & close timestamps (kept
--       separate from created_at/completed_at, which are journal-side times).
--   * broker_ref — the broker's order / ticket / deal reference. This is the
--       DEDUPE key: importing a reference that already exists is rejected.
--   * import_source — 'manual' | 'broker_text' | 'screenshot', for provenance.
--
-- The money columns (gross_pnl, fees, net_pnl) already exist from migration
-- 0004 and keep their meaning: signed gross result, fees, and net = gross − fees.
--
-- How to apply:
--   Option A (dashboard): Supabase project → SQL Editor → paste → Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety: additive and re-runnable (IF NOT EXISTS). New columns are nullable, so
-- every pre-existing row keeps working (import_source is NULL for old trades,
-- read as "manual" by the app).

alter table public.completed_trade
  add column if not exists position_size numeric,
  add column if not exists opened_at     timestamptz,
  add column if not exists closed_at     timestamptz,
  add column if not exists broker_ref    text,
  add column if not exists import_source text;

-- Duplicate-import guard: a broker reference is unique PER USER. The partial
-- index ignores the many rows with no reference (manual entries), so it only
-- constrains real broker imports. A second import of the same ticket fails here
-- even if the client-side check is bypassed.
create unique index if not exists completed_trade_user_broker_ref_key
  on public.completed_trade (user_id, broker_ref)
  where broker_ref is not null;
