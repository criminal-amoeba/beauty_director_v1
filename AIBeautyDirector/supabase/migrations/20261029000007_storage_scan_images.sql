-- Private bucket for weekly-scan photos. Path convention: scan-images/{user_id}/{file}.
-- Read via signed URLs only. Retention cleanup comes with the data-lifecycle work (step 11).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scan-images', 'scan-images', false, 10485760, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy scan_images_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'scan-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy scan_images_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scan-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy scan_images_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'scan-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No update policy: photos are never overwritten.
