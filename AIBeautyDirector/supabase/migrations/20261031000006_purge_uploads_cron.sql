-- Photo retention: once a day, remove scan uploads older than 24 h whose scan never ran (the scan itself
-- deletes its photo in every path). The work happens in the purge-uploads Edge Function because storage
-- files must be deleted through the Storage API; a SQL delete on storage.objects would orphan the file.
--
-- Before applying, per project (dev now, prod in step 12), in the SQL Editor:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<long random string>', 'purge_uploads_secret');
-- and set the same string as the Edge Function secret PURGE_UPLOADS_SECRET, then deploy purge-uploads.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'purge-stale-scan-uploads',
  '17 3 * * *', -- daily 03:17 UTC (11:17 Taipei), off the hour
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/purge-uploads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-purge-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_uploads_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
