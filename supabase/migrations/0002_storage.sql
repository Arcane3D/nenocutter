-- Optional thumbnail bucket. Skip this file if your project restricts storage policies.

insert into storage.buckets (id, name, public)
values ('thumbnails', 'thumbnails', true)
on conflict (id) do nothing;

drop policy if exists "thumbnails public read" on storage.objects;
drop policy if exists "thumbnails owner write" on storage.objects;
drop policy if exists "thumbnails owner update" on storage.objects;
drop policy if exists "thumbnails owner delete" on storage.objects;

create policy "thumbnails public read" on storage.objects
  for select using (bucket_id = 'thumbnails');

create policy "thumbnails owner write" on storage.objects
  for insert with check (
    bucket_id = 'thumbnails'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "thumbnails owner update" on storage.objects
  for update using (
    bucket_id = 'thumbnails'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "thumbnails owner delete" on storage.objects
  for delete using (
    bucket_id = 'thumbnails'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
