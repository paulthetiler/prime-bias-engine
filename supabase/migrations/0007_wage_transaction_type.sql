-- PrimeBias Engine — wage-withdrawal transaction type (Wage Maker integration, phase 3).
--
-- Extends the allowed account_transaction.type values with 'wage_withdrawal' so
-- profit taken out as personal wages can be recorded separately from ordinary
-- capital withdrawals. A wage withdrawal reduces cash balance (like a withdrawal)
-- but is separately identifiable, so future wage statistics never have to guess
-- which withdrawals were wages.
--
--   allowed types (after this migration):
--     'deposit', 'withdrawal', 'adjustment', 'wage_withdrawal'
--
-- The type CHECK created in 0004 was defined inline on the table, so Postgres
-- auto-named it (conventionally account_transaction_type_check). Rather than
-- assume the name, this migration DISCOVERS every CHECK constraint on
-- account_transaction.type, drops it, then recreates one canonical, explicitly
-- named constraint. That makes the migration robust to the original name AND
-- re-runnable (each run drops the current type-check and adds the canonical one).
--
-- How to apply:
--   Option A (dashboard): Supabase project -> SQL Editor -> paste -> Run.
--   Option B (CLI): `supabase db push`.
--
-- Safety: existing rows already use only the original three types, which remain
-- allowed, so the new constraint validates cleanly with NO backfill. Old
-- 'withdrawal' rows are left exactly as they are — they are NEVER reclassified as
-- wages. No column is dropped or repurposed.

do $$
declare
  con text;
begin
  -- Drop whatever CHECK constraint currently governs account_transaction.type,
  -- whatever its auto-generated name.
  for con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.account_transaction'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%type%'
  loop
    execute format('alter table public.account_transaction drop constraint %I;', con);
  end loop;

  -- Recreate one canonical, explicitly named constraint including the new value.
  alter table public.account_transaction
    add constraint account_transaction_type_check
    check (type in ('deposit', 'withdrawal', 'adjustment', 'wage_withdrawal'));
end;
$$;
