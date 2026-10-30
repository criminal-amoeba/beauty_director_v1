-- Append-only change history (step 10 §A). One trigger diffs every insert / update on the user-entered tables
-- and writes one event per changed field (one event per inserted row). Nothing in the app writes events directly.
-- source: 'ai_proposal_accepted' only when apply_chat_action set app.change_source in the same transaction
-- (clients cannot set it through PostgREST); otherwise 'onboarding' until profiles.onboarding_completed, then 'user'.

create table public.profile_change_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null check (entity in ('skin_profile', 'reaction', 'product', 'settings', 'routine')),
  row_id uuid not null,
  field text check (char_length(field) <= 63), -- null = the row was inserted (new_value = the row)
  old_value jsonb,
  new_value jsonb,
  source text not null check (source in ('onboarding', 'user', 'ai_proposal_accepted')),
  created_at timestamptz not null default now()
);
create index profile_change_events_user_recent_idx on public.profile_change_events (user_id, created_at desc);

alter table public.profile_change_events enable row level security;
revoke all on public.profile_change_events from anon, authenticated;
grant select on public.profile_change_events to authenticated;
create policy profile_change_events_select_own on public.profile_change_events
  for select to authenticated using ((select auth.uid()) = user_id);

create function private.log_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  src text := nullif(current_setting('app.change_source', true), '');
  skip constant text[] := array['id', 'user_id', 'created_at', 'updated_at'];
  n jsonb := to_jsonb(new) - skip;
  o jsonb;
  rid uuid := coalesce((to_jsonb(new) ->> 'id')::uuid, new.user_id); -- 1:1 tables have no id column
  k text;
begin
  if src is null then
    select case when p.onboarding_completed then 'user' else 'onboarding' end into src
    from public.profiles p where p.user_id = new.user_id;
    src := coalesce(src, 'user');
  end if;

  if tg_op = 'INSERT' then
    insert into public.profile_change_events (user_id, entity, row_id, field, old_value, new_value, source)
    values (new.user_id, tg_argv[0], rid, null, null, n, src);
  else
    o := to_jsonb(old) - skip;
    for k in select jsonb_object_keys(n) loop
      if n -> k is distinct from o -> k then
        insert into public.profile_change_events (user_id, entity, row_id, field, old_value, new_value, source)
        values (new.user_id, tg_argv[0], rid, k, o -> k, n -> k, src);
      end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function private.log_profile_change() from public, anon, authenticated;

create trigger skin_profiles_log_change after insert or update on public.skin_profiles
  for each row execute function private.log_profile_change('skin_profile');
create trigger product_reactions_log_change after insert or update on public.product_reactions
  for each row execute function private.log_profile_change('reaction');
create trigger user_products_log_change after insert or update on public.user_products
  for each row execute function private.log_profile_change('product');
create trigger user_settings_log_change after insert or update on public.user_settings
  for each row execute function private.log_profile_change('settings');
create trigger routines_log_change after insert or update on public.routines
  for each row execute function private.log_profile_change('routine');
