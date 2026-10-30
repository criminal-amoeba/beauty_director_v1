-- RLS / grants / constraint tests. Run the whole file as one query (SQL Editor or MCP execute_sql).
-- Everything runs inside a transaction that is rolled back, so nothing is left behind.
-- Pass = the query finishes without error. Any failure raises 'FAIL: ...'.

begin;

-- ── Fixtures (as postgres, bypassing RLS) ───────────────────────────────────
insert into auth.users (id, aud, role, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-a@test.invalid', '{"locale":"en-US"}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-b@test.invalid', '{}');

insert into public.user_products (id, user_id, name) values
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002', 'B cream');
insert into public.product_reactions (user_id, product_id, reaction) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'stinging');
insert into public.routines (id, user_id, period, version, source) values
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-000000000002', 'am', 1, 'system');
insert into public.routine_steps (user_id, routine_id, position, step_type) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000b2', 1, 'cleanse');
insert into public.routine_completions (user_id, routine_id, period, local_date) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'am', current_date);
insert into public.daily_checkins (user_id, local_date, dryness) values
  ('bbbbbbbb-0000-4000-8000-000000000002', current_date, 2);
insert into public.consents (user_id, purpose, granted, policy_version) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'photo_analysis', true, 'test');
-- now() is frozen inside a transaction, so A's earlier grant is seeded a minute in the past.
insert into public.consents (user_id, purpose, granted, policy_version, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'photo_analysis', true, 'test', now() - interval '1 minute');
insert into public.scans (id, user_id, status, provider, provider_model_version, capture_protocol_version, completed_at) values
  ('bbbbbbbb-0000-4000-8000-0000000000b3', 'bbbbbbbb-0000-4000-8000-000000000002', 'succeeded', 'test', 'v1', 'v1', now());
insert into public.scan_metrics (user_id, scan_id, metric_code, value, metric_definition_version) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000b3', 'pore_visibility', 42, 'v1');
insert into public.chat_threads (id, user_id, origin, scan_id) values
  ('bbbbbbbb-0000-4000-8000-0000000000b4', 'bbbbbbbb-0000-4000-8000-000000000002', 'weekly_scan', 'bbbbbbbb-0000-4000-8000-0000000000b3');
insert into public.chat_messages (user_id, thread_id, role, content) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000b4', 'assistant', 'hello B');
insert into storage.objects (bucket_id, name, owner) values
  ('scan-images', 'bbbbbbbb-0000-4000-8000-000000000002/b.jpg', 'bbbbbbbb-0000-4000-8000-000000000002');

-- ── Trigger + constraints (as postgres) ─────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from public.profiles where user_id in ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002');
  if n <> 2 then raise exception 'FAIL: new-user trigger did not create profiles'; end if;
  if (select locale from public.user_settings where user_id = 'aaaaaaaa-0000-4000-8000-000000000001') <> 'en' then
    raise exception 'FAIL: locale en-US should map to en'; end if;
  if (select locale from public.user_settings where user_id = 'bbbbbbbb-0000-4000-8000-000000000002') <> 'zh-TW' then
    raise exception 'FAIL: missing locale should default to zh-TW'; end if;

  begin
    insert into public.scans (user_id, status, provider, capture_protocol_version)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'succeeded', 'test', 'v1');
    raise exception 'FAIL: succeeded scan without completed_at/model version was accepted';
  exception when check_violation then null; end;

  insert into public.scans (user_id, provider, capture_protocol_version) values ('bbbbbbbb-0000-4000-8000-000000000002', 'test', 'v1');
  begin
    insert into public.scans (user_id, provider, capture_protocol_version) values ('bbbbbbbb-0000-4000-8000-000000000002', 'test', 'v1');
    raise exception 'FAIL: second in-flight scan was accepted';
  exception when unique_violation then null; end;
end;
$$;

-- ── As user A ───────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  b constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  t text;
  n int;
begin
  -- A sees none of B's rows, and can't change or delete them.
  foreach t in array array[
    'profiles', 'user_settings', 'skin_profiles', 'consents', 'current_consents',
    'user_products', 'product_reactions', 'routines', 'routine_steps', 'routine_completions',
    'daily_checkins', 'scans', 'scan_metrics', 'chat_threads', 'chat_messages',
    'profile_change_events', 'chat_actions'
  ] loop
    execute format('select count(*) from public.%I where user_id = %L', t, b) into n;
    if n <> 0 then raise exception 'FAIL: A can read B rows in %', t; end if;

    if t <> 'current_consents' then
      begin
        execute format('update public.%I set user_id = user_id where user_id = %L', t, b);
        get diagnostics n = row_count;
        if n <> 0 then raise exception 'FAIL: A updated B rows in %', t; end if;
      exception when insufficient_privilege then null; end;

      begin
        execute format('delete from public.%I where user_id = %L', t, b);
        get diagnostics n = row_count;
        if n <> 0 then raise exception 'FAIL: A deleted B rows in %', t; end if;
      exception when insufficient_privilege then null; end;
    end if;
  end loop;

  -- A sees their own 1:1 rows and can edit them.
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: A should see exactly 1 profile, saw %', n; end if;
  update public.profiles set display_name = 'A', birth_date = '1995-05-05', onboarding_step = 2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not update own profile'; end if;
  update public.user_settings set persona = 'strict_coach', timezone = 'Asia/Tokyo';

  -- 18+ gate, timezone and code checks.
  begin
    update public.profiles set birth_date = current_date - interval '17 years';
    raise exception 'FAIL: under-18 birth_date accepted';
  exception when check_violation then null; end;
  begin
    update public.user_settings set timezone = 'Mars/Olympus';
    raise exception 'FAIL: invalid timezone accepted';
  exception when invalid_parameter_value then null; end;
  begin
    update public.skin_profiles set goals = array['hydration', 'cure_acne'];
    raise exception 'FAIL: unknown goal code accepted';
  exception when check_violation then null; end;

  -- A can't write rows for B.
  begin
    insert into public.user_products (user_id, name) values (b, 'sneaky');
    raise exception 'FAIL: A inserted a product for B';
  exception when insufficient_privilege then null; end;

  -- A can't attach rows to B's product / routine (composite FK).
  begin
    insert into public.product_reactions (product_id, reaction) values ('bbbbbbbb-0000-4000-8000-0000000000b1', 'redness');
    raise exception 'FAIL: A linked a reaction to B product';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.routine_steps (routine_id, position, step_type) values ('bbbbbbbb-0000-4000-8000-0000000000b2', 2, 'tone');
    raise exception 'FAIL: A added a step to B routine';
  exception when foreign_key_violation then null; end;

  -- Server-only tables: no client writes.
  begin
    insert into public.scans (user_id, provider, capture_protocol_version) values (a, 'test', 'v1');
    raise exception 'FAIL: A inserted a scan';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.scan_metrics (user_id, scan_id, metric_code, value, metric_definition_version)
    values (a, 'bbbbbbbb-0000-4000-8000-0000000000b3', 'pore_visibility', 1, 'v1');
    raise exception 'FAIL: A inserted a scan metric';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.chat_threads (user_id) values (a);
    raise exception 'FAIL: A inserted a chat thread';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.chat_messages (user_id, thread_id, role, content) values (a, 'bbbbbbbb-0000-4000-8000-0000000000b4', 'user', 'hi');
    raise exception 'FAIL: A inserted a chat message';
  exception when insufficient_privilege then null; end;

  -- Consents: append-only, created_at not client-settable.
  insert into public.consents (purpose, granted, policy_version) values ('photo_analysis', false, 'test');
  if (select granted from public.current_consents where purpose = 'photo_analysis') then
    raise exception 'FAIL: current_consents should show the latest (revoked) row'; end if;
  begin
    update public.consents set granted = true;
    raise exception 'FAIL: A updated a consent row';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.consents (purpose, granted, policy_version, created_at) values ('marketing', true, 'test', '2000-01-01');
    raise exception 'FAIL: A backdated a consent';
  exception when insufficient_privilege then null; end;

  -- Own routine + completion; second completion the same day is rejected.
  insert into public.routines (id, period, version, source) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'pm', 1, 'system');
  insert into public.routine_completions (routine_id, period, local_date) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'pm', current_date);
  begin
    insert into public.routine_completions (routine_id, period, local_date) values ('aaaaaaaa-0000-4000-8000-0000000000a2', 'pm', current_date);
    raise exception 'FAIL: double completion accepted';
  exception when unique_violation then null; end;
  begin
    update public.routine_completions set local_date = current_date - 1;
    raise exception 'FAIL: A edited a completion';
  exception when insufficient_privilege then null; end;

  -- Storage: A can't see B's photo or upload into B's folder; can upload into own folder.
  select count(*) into n from storage.objects where bucket_id = 'scan-images';
  if n <> 0 then raise exception 'FAIL: A can see % scan-images objects', n; end if;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('scan-images', b || '/evil.jpg', a);
    raise exception 'FAIL: A uploaded into B folder';
  exception when insufficient_privilege then null; end;
  insert into storage.objects (bucket_id, name, owner) values ('scan-images', a || '/mine.jpg', a);
end;
$$;

-- ── As anon (signed out) ────────────────────────────────────────────────────
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'skin_profiles', 'consents', 'current_consents',
    'user_products', 'product_reactions', 'routines', 'routine_steps', 'routine_completions',
    'daily_checkins', 'scans', 'scan_metrics', 'chat_threads', 'chat_messages',
    'profile_change_events', 'chat_actions', 'active_conflict_rules'
  ] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL: anon can query %', t;
    exception when insufficient_privilege then null; end;
  end loop;
end;
$$;

rollback;
