-- Prime Bias — journal screenshot attachments.
-- Screenshots are private user evidence attached to trade journal entries.

alter table public.trade_journal_entry
  add column if not exists screenshot_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-screenshots',
  'journal-screenshots',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files live under <auth.uid()>/<uuid>.<ext>. Users can only access their own folder.
drop policy if exists "journal screenshots select own" on storage.objects;
create policy "journal screenshots select own"
on storage.objects for select
using (
  bucket_id = 'journal-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "journal screenshots insert own" on storage.objects;
create policy "journal screenshots insert own"
on storage.objects for insert
with check (
  bucket_id = 'journal-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "journal screenshots delete own" on storage.objects;
create policy "journal screenshots delete own"
on storage.objects for delete
using (
  bucket_id = 'journal-screenshots'
  and (storage.foldername(name))[1] = auth.uid()::text
);
