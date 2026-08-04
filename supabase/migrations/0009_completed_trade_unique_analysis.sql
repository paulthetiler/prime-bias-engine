-- PrimeBias Engine — database-level duplicate protection for completed trades
-- (issue #14, phase 5; the guarantee deferred from phase 4).
--
-- Enforces "one completed trade per (user, analysis session)" with a PARTIAL
-- UNIQUE index on (user_id, analysis_id) WHERE analysis_id IS NOT NULL. The
-- partial predicate lets unlimited legacy rows with a NULL analysis_id coexist.
--
-- SAFETY / NON-DESTRUCTIVE INVESTIGATION — AND THE MIGRATION MUST FAIL LOUDLY:
-- Creating a unique index fails if duplicates already exist, and this migration
-- must never remove rows to force it through. So it INVESTIGATES first: it counts
-- duplicate (user_id, analysis_id) groups and prints the offending groups, then
-- RAISES AN EXCEPTION so the whole migration FAILS and is NOT recorded as
-- applied. (A migration that exited successfully without the index could be
-- marked applied by Supabase, and `supabase db push` would not run it again —
-- leaving uniqueness unenforced. Failing keeps it pending until it can create
-- the index.)
--
-- Behaviour matrix:
--   * clean database      -> creates the index, succeeds.
--   * duplicates present   -> prints the groups, RAISES, creates nothing, stays
--                            unapplied.
--   * duplicates resolved  -> re-run succeeds and creates the index.
--   * index already exists -> IF NOT EXISTS makes it a safe no-op success.
--
-- It NEVER deletes, archives or modifies any row. Resolving duplicates (choosing
-- which row to keep) is a manual operator step done BEFORE re-running.
--
-- How to apply:
--   Option A (dashboard): Supabase project -> SQL Editor -> paste -> Run; on
--     failure, read the RAISE output, resolve the listed duplicates, Run again.
--   Option B (CLI): `supabase db push`; on failure resolve duplicates and push
--     again (it stays pending until it succeeds).

do $$
declare
  dup_groups int;
  r record;
begin
  select count(*) into dup_groups from (
    select user_id, analysis_id
    from public.completed_trade
    where analysis_id is not null
    group by user_id, analysis_id
    having count(*) > 1
  ) d;

  if dup_groups > 0 then
    raise notice 'completed_trade: % (user_id, analysis_id) group(s) contain duplicates. Resolve each (keep one row per group), then re-run this migration:', dup_groups;
    for r in
      select user_id, analysis_id, count(*) as n, array_agg(id) as ids
      from public.completed_trade
      where analysis_id is not null
      group by user_id, analysis_id
      having count(*) > 1
      order by count(*) desc
    loop
      raise notice '  user=% analysis_id=% count=% ids=%', r.user_id, r.analysis_id, r.n, r.ids;
    end loop;
    -- Fail the migration so it is NOT recorded as applied and nothing is created.
    raise exception 'Aborting: % duplicate (user_id, analysis_id) group(s) in completed_trade. No index created; resolve duplicates and re-run.', dup_groups;
  end if;

  -- No duplicates: enforce uniqueness. IF NOT EXISTS makes an existing index a
  -- safe no-op on re-run.
  create unique index if not exists completed_trade_user_analysis_uk
    on public.completed_trade (user_id, analysis_id)
    where analysis_id is not null;
  raise notice 'completed_trade_user_analysis_uk is present (created or already existed).';
end;
$$;
