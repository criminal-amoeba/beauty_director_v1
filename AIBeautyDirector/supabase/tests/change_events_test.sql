-- Change-event trigger + products v2 / routine version rules. Run as one query after the step 10 migrations
-- (npx supabase db query --linked -f supabase/tests/change_events_test.sql). Rolled back; pass = no 'FAIL'.

begin;

insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ce-a@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ce-b@test.invalid');
insert into public.user_products (id, user_id, name) values
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002', 'B cream');

-- ── Trigger (as postgres) ───────────────────────────────────────────────────
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  e record;
  n int;
  pid uuid;
  rid uuid;
begin
  -- New-user trigger inserts land as 'onboarding' row events.
  select count(*) into n from public.profile_change_events where user_id = a and field is null and source = 'onboarding';
  if n <> 2 then raise exception 'FAIL: expected 2 insert events (skin_profile, settings) for a new user, got %', n; end if;

  -- 1. Update before onboarding completes → source onboarding, field-level old/new.
  update public.skin_profiles set goals = array['hydration'] where user_id = a;
  select * into e from public.profile_change_events where user_id = a and entity = 'skin_profile' and field = 'goals';
  if e.source <> 'onboarding' or e.old_value <> '[]'::jsonb or e.new_value <> '["hydration"]'::jsonb then
    raise exception 'FAIL: 1 goals event wrong: %', to_jsonb(e); end if;

  -- 2. After onboarding → source user.
  update public.profiles set onboarding_completed = true where user_id = a;
  update public.skin_profiles set budget = 'mid' where user_id = a;
  select source into e from public.profile_change_events where user_id = a and field = 'budget';
  if e.source <> 'user' then raise exception 'FAIL: 2 expected source user, got %', e.source; end if;

  -- 3. Product insert → exactly one event, field null, row without id/user_id.
  insert into public.user_products (user_id, name, category) values (a, 'Cream', 'moisturizer') returning id into pid;
  select count(*) into n from public.profile_change_events where row_id = pid;
  if n <> 1 then raise exception 'FAIL: 3 expected 1 insert event, got %', n; end if;
  select * into e from public.profile_change_events where row_id = pid;
  if e.field is not null or e.entity <> 'product' or not (e.new_value ? 'name') or (e.new_value ? 'id') or (e.new_value ? 'user_id') then
    raise exception 'FAIL: 3 insert event shape: %', to_jsonb(e); end if;

  -- 4. Status change → one event with old/new; an updated_at-only write logs nothing.
  update public.user_products set status = 'paused' where id = pid;
  select * into e from public.profile_change_events where row_id = pid and field = 'status';
  if e.old_value <> '"active"'::jsonb or e.new_value <> '"paused"'::jsonb or e.source <> 'user' then
    raise exception 'FAIL: 4 status event: %', to_jsonb(e); end if;
  update public.user_products set updated_at = now() where id = pid;
  select count(*) into n from public.profile_change_events where row_id = pid;
  if n <> 2 then raise exception 'FAIL: 4 expected 2 events after no-op update, got %', n; end if;

  -- 5. Resolving a reaction logs resolved_at.
  insert into public.product_reactions (user_id, ingredient, reaction) values (a, 'fragrance', 'redness') returning id into rid;
  update public.product_reactions set resolved_at = now() where id = rid;
  select * into e from public.profile_change_events where row_id = rid and field = 'resolved_at';
  if e.entity <> 'reaction' or e.old_value <> 'null'::jsonb or e.new_value is null then
    raise exception 'FAIL: 5 resolved_at event: %', to_jsonb(e); end if;

  -- Routine version bookkeeping: an active routine needs a version; candidates don't.
  begin
    insert into public.routines (user_id, period) values (a, 'am');
    raise exception 'FAIL: active routine without version accepted';
  exception when check_violation then null; end;
  insert into public.routines (user_id, period, is_active, source) values (a, 'am', false, 'system');
end;
$$;

-- ── As user A (onboarding completed) ────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  n int;
begin
  -- 6. Events: own only, read only.
  select count(*) into n from public.profile_change_events where user_id = b;
  if n <> 0 then raise exception 'FAIL: 6 A can read B events'; end if;
  select count(*) into n from public.profile_change_events where user_id = a;
  if n < 5 then raise exception 'FAIL: 6 A should see own events, saw %', n; end if;
  begin
    insert into public.profile_change_events (user_id, entity, row_id, source) values (a, 'product', a, 'user');
    raise exception 'FAIL: 6 A inserted an event';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profile_change_events where user_id = a;
    raise exception 'FAIL: 6 A deleted events';
  exception when insufficient_privilege then null; end;

  -- 7. After onboarding, products and reactions can't be deleted (policy → 0 rows, no error).
  delete from public.user_products where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: 7 A deleted a product after onboarding'; end if;
  delete from public.product_reactions where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: 7 A deleted a reaction after onboarding'; end if;
  update public.user_products set status = 'finished' where user_id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: 7 A could not finish own product'; end if;

  -- 8. Clients can create versions but never claim the AI source; deletes are revoked.
  begin
    insert into public.routines (period, version, source) values ('pm', 1, 'ai_proposal_accepted');
    raise exception 'FAIL: 8 client claimed ai_proposal_accepted';
  exception when insufficient_privilege then null; end;
  insert into public.routines (period, version, source) values ('pm', 1, 'system');
  begin
    delete from public.routines where user_id = a;
    raise exception 'FAIL: 8 A deleted a routine';
  exception when insufficient_privilege then null; end;
end;
$$;

-- ── As user B (onboarding not completed): delete still works ────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare n int;
begin
  delete from public.user_products where id = 'bbbbbbbb-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: B could not delete own product during onboarding'; end if;
end;
$$;

rollback;
