-- Prime Bias — archive state for trade journal entries.
-- Additive only: existing journal entries remain active by default.

alter table public.trade_journal_entry
  add column if not exists archived_at timestamptz;

create index if not exists trade_journal_entry_user_archived_created_idx
  on public.trade_journal_entry (user_id, archived_at, created_date desc);
