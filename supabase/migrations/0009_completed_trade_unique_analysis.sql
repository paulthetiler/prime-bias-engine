-- PrimeBias Engine — database-level duplicate protection for completed trades
-- (issue #14, phase 5; the guarantee deferred from phase 4).
--
-- Enforces "one completed trade per (user, analysis session)" with a PARTIAL
-- UNIQUE index on (user_id, analysis_id) WHERE analysis_id IS NOT NULL. The
-- partial predicate lets unlimited legacy rows with a NULL analysis_id coexist
-- (Postgres would treat NULLs as distinct anyway; the predicate makes the intent
-- explicit and keeps the index small).
--
-- SAFETY / NON-DESTRUCTIVE INVESTIGATION:
-- Creating a unique index FAILS if duplicates already exist, and this migration
-- must never delete data to force it through. So it INVESTIGATES first: it counts
-- duplicate (user_id, analysis_id) groups and only creates the index when there
-- are none. If duplicates exist it raises a NOTICE listing how many groups are
-- affected and leaves the index uncreated, so an operator can resolve the
-- duplicates (choose which row to keep) and re-run. The migration itself always
-- succeeds and is re-runnable (IF NOT EXISTS on the create).
--
-- How to apply:
--   Option A (dashboard): Supabase project -> SQL Editor -> paste -> Run, then
--     read the NOTICES pane.
--   Option B (CLI): `supabase db push`.

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
    raise notice 'completed_trade: % (user_id, analysis_id) group(s) contain duplicates — UNIQUE index NOT created.', dup_groups;
    raise notice 'Resolve the duplicates below (keep one row per group), then re-run this migration:';
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
  else
    create unique index if not exists completed_trade_user_analysis_uk
      on public.completed_trade (user_id, analysis_id)
      where analysis_id is not null;
    raise notice 'completed_trade_user_analysis_uk is present (created or already existed).';
  end if;
end;
$$;
