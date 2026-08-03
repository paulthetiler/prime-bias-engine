-- PrimeBias Engine — account-led financial model.
--
-- Adds real money tracking behind Trade History and Performance:
--   * trading_account      — one or more accounts per user (currency + starting
--                            balance). Every completed trade belongs to one.
--   * account_transaction  — deposits / withdrawals / manual adjustments, kept
--                            SEPARATE from trades so the historic balance is
--                            calculated, never overwritten.
--   * completed_trade      — gains the financial result columns (account_id,
--                            gross_pnl, fees, net_pnl, amount_risked).
--
-- Balance is always CALCULATED:
--   starting_balance + deposits - withdrawals + realised net trade P/L
--   + reconciliation adjustments
--
-- How to apply:
--   Option A (dashboard): Supabase project -> SQL Editor -> paste -> Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety: additive and re-runnable (IF NOT EXISTS). New columns are nullable,
-- so every pre-existing row keeps working. `net_pnl IS NULL` marks a trade whose
-- monetary result has not been entered yet (financially incomplete) — existing
-- win/loss rows are NEVER assigned an invented amount; the app backfills only
-- from the legacy `pnl` column where a real number already exists.

-- ─────────────────────────────────────────────────────────── trading_account
create table if not exists public.trading_account (
  id               text primary key default (gen_random_uuid())::text,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_date     timestamptz not null default now(),
  updated_date     timestamptz not null default now(),
  name             text not null,
  currency         text not null default 'USD',
  starting_balance numeric not null default 0,
  created_at       timestamptz not null default now(),
  archived_at      timestamptz
);

-- ─────────────────────────────────────────────────────── account_transaction
create table if not exists public.account_transaction (
  id           text primary key default (gen_random_uuid())::text,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  account_id   text not null references public.trading_account (id) on delete cascade,
  type         text not null check (type in ('deposit', 'withdrawal', 'adjustment')),
  amount       numeric not null,
  occurred_at  timestamptz not null default now(),
  note         text
);

-- ─────────────────────────────────── completed_trade financial result columns
alter table public.completed_trade
  add column if not exists account_id    text references public.trading_account (id) on delete set null,
  add column if not exists gross_pnl     numeric,
  add column if not exists fees          numeric,
  add column if not exists net_pnl       numeric,
  add column if not exists amount_risked numeric;

create index if not exists completed_trade_account_idx
  on public.completed_trade (user_id, account_id);

create index if not exists account_transaction_account_idx
  on public.account_transaction (user_id, account_id, occurred_at);

-- Triggers, per-user indexes and Row Level Security for the new tables.
do $$
declare
  t text;
begin
  foreach t in array array['trading_account', 'account_transaction']
  loop
    execute format('drop trigger if exists set_updated_date on public.%I;', t);
    execute format('create trigger set_updated_date before update on public.%I for each row execute function public.set_updated_date();', t);

    execute format('create index if not exists %I on public.%I (user_id, created_date desc);', t || '_user_created_idx', t);

    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "own rows" on public.%I;', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t
    );
  end loop;
end;
$$;
