-- PrimeBias Engine — initial schema (migrated off Base44).
--
-- How to apply:
--   Option A (dashboard): open your Supabase project → SQL Editor → paste this
--     whole file → Run.
--   Option B (CLI): `supabase db push` after linking your project.
--
-- Every table is scoped to the signed-in user via Row Level Security, so each
-- account only ever sees its own rows. `id` is text so imported Base44 records
-- (whose ids are arbitrary strings) can keep their original identifiers.

-- Keep `updated_date` fresh on every UPDATE.
create or replace function public.set_updated_date()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────── bias_analysis
create table if not exists public.bias_analysis (
  id               text primary key default (gen_random_uuid())::text,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_date     timestamptz not null default now(),
  updated_date     timestamptz not null default now(),
  instrument       text,
  "timestamp"      timestamptz,
  inputs           jsonb,
  results          jsonb,
  overall_bias     text,
  grade            text,
  confidence_score numeric,
  trade_action     text,
  warnings         jsonb,
  notes            text,
  outcome          text default 'pending'
);

-- ─────────────────────────────────────────────────────────── completed_trade
create table if not exists public.completed_trade (
  id               text primary key default (gen_random_uuid())::text,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_date     timestamptz not null default now(),
  updated_date     timestamptz not null default now(),
  instrument       text,
  status           text default 'completed',
  result           text,
  direction        text,
  grade            text,
  trade_status     text,
  trade_action     text,
  score            numeric,
  target           numeric,
  alignment        text,
  deep_trend       text,
  deep_strength    text,
  dd_bias          text,
  dd_strength      text,
  now_bias         text,
  now_strength     text,
  extra_check_h1   numeric,
  extra_check_m15  numeric,
  inputs_snapshot  jsonb,
  created_at       timestamptz,
  completed_at     timestamptz,
  entry_price      numeric,
  exit_price       numeric,
  pnl              numeric,
  exit_reason      text,
  notes            text,
  screenshot_url   text
);

-- ─────────────────────────────────────────────────────────── monthly_journal
create table if not exists public.monthly_journal (
  id               text primary key default (gen_random_uuid())::text,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_date     timestamptz not null default now(),
  updated_date     timestamptz not null default now(),
  month            text,
  year             integer,
  start_balance    numeric,
  end_balance      numeric,
  pnl              numeric,
  pnl_percent      numeric,
  total_positions  numeric,
  winrate          numeric,
  total_pips       numeric,
  ave_win          numeric,
  ave_pip          numeric,
  bid_size         numeric,
  next_bid         numeric,
  wage             numeric,
  goal_month       numeric,
  goal_week        numeric,
  goal_day         numeric,
  rules            jsonb,
  notes            text
);

-- ─────────────────────────────────────────────────────── trade_journal_entry
create table if not exists public.trade_journal_entry (
  id                 text primary key default (gen_random_uuid())::text,
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_date       timestamptz not null default now(),
  updated_date       timestamptz not null default now(),
  completed_trade_id text,
  instrument         text,
  result             text,
  direction          text,
  grade              text,
  score              numeric,
  trade_status       text,
  trade_action       text,
  target             numeric,
  alignment          text,
  deep_trend         text,
  dd_bias            text,
  now_bias           text,
  followed_plan      text,
  mistake_tags       jsonb,
  lesson_tags        jsonb,
  what_happened      text,
  lesson             text,
  screenshot_url     text,
  created_at         timestamptz
);

-- Triggers, indexes and Row Level Security for every table.
do $$
declare
  t text;
begin
  foreach t in array array['bias_analysis', 'completed_trade', 'monthly_journal', 'trade_journal_entry']
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
