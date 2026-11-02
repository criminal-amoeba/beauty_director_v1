-- Drop the hand-built pre-migration schema (src/db/schema.sql). Dev held only test data.
-- Everything is `if exists`, so this is a no-op on a fresh (production) project.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists
  public.ai_memory,
  public.conversations,
  public.routine_steps,
  public.routines,
  public.daily_checkins,
  public.scan_jobs,
  public.scan_baseline,
  public.skin_metrics,
  public.product_usage,
  public.reactions,
  public.products,
  public.user_profiles,
  public.consent,
  public.skin_scans
  cascade;

-- Old scan-images policies (one owner-based, four dashboard-generated). Recreated in storage_scan_images.
drop policy if exists scan_images_own on storage.objects;
drop policy if exists "Allow users own folder access, admins full access drwb7s_0" on storage.objects;
drop policy if exists "Allow users own folder access, admins full access drwb7s_1" on storage.objects;
drop policy if exists "Allow users own folder access, admins full access drwb7s_2" on storage.objects;
drop policy if exists "Allow users own folder access, admins full access drwb7s_3" on storage.objects;

-- Dashboard-created event-trigger function that auto-enables RLS on new tables: keep it,
-- but stop exposing it as /rest/v1/rpc/rls_auto_enable.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;
