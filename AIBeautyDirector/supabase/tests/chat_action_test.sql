-- apply_chat_action: callable only by the service role, acts only on the caller's own stored blocks, one
-- action per block, writes land as 'ai_proposal_accepted' change events. Rolled back; pass = no 'FAIL'.

begin;

insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ca-a@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ca-b@test.invalid');
update public.profiles set onboarding_completed = true;

insert into public.user_products (id, user_id, name, category) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'A serum', 'serum'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002', 'B cream', 'moisturizer');
insert into public.routines (id, user_id, period, is_active, version, source) values
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-000000000001', 'pm', true, 1, 'system'),
  ('aaaaaaaa-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-000000000001', 'pm', false, null, 'system'),
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-000000000002', 'pm', false, null, 'system');
insert into public.chat_threads (id, user_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-000000000001');
insert into public.chat_messages (id, user_id, thread_id, role, content, blocks) values
  ('aaaaaaaa-0000-4000-8000-0000000000a5', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a4', 'assistant', 'hi', '[
    {"type":"routine_proposal","id":"b1","candidate_routine_id":"aaaaaaaa-0000-4000-8000-0000000000a3","period":"pm","diff":{"added":[],"removed":[],"moved":[]},"reason":"r"},
    {"type":"confirm_change","id":"b2","entity":"skin_profile","row_id":null,"field":"budget","new_value":"mid","label":"l","reason":"r"},
    {"type":"confirm_change","id":"b3","entity":"skin_profile","row_id":null,"field":"user_id","new_value":"x","label":"l","reason":"r"},
    {"type":"product_card","id":"b4","mode":"suggest_add","product_id":null,"name":"New toner","brand":null,"category":"toner"},
    {"type":"confirm_change","id":"b5","entity":"reaction","row_id":null,"field":"new","new_value":{"product_id":"bbbbbbbb-0000-4000-8000-0000000000b1","reaction":"stinging"},"label":"l","reason":"r"},
    {"type":"routine_proposal","id":"b6","candidate_routine_id":"bbbbbbbb-0000-4000-8000-0000000000b2","period":"pm","diff":{"added":[],"removed":[],"moved":[]},"reason":"r"},
    {"type":"confirm_change","id":"b7","entity":"product","row_id":"aaaaaaaa-0000-4000-8000-0000000000a1","field":"status","new_value":"paused","label":"l","reason":"r"}
  ]'::jsonb);

-- ── 1. Clients can't call it ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}';
do $$
begin
  begin
    perform public.apply_chat_action('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a4',
      'aaaaaaaa-0000-4000-8000-0000000000a5', 'b1', '{"type":"accept_routine"}');
    raise exception 'FAIL: 1 authenticated could call apply_chat_action';
  exception when insufficient_privilege then null; end;
end;
$$;

-- ── As the service role ─────────────────────────────────────────────────────
reset role;
set local request.jwt.claims = '{"role":"authenticated"}';
do $$
begin
  begin
    perform public.apply_chat_action('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a4',
      'aaaaaaaa-0000-4000-8000-0000000000a5', 'b1', '{"type":"accept_routine"}');
    raise exception 'FAIL: 1b non-service JWT accepted';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: 1b expected forbidden, got %', sqlerrm; end if;
  end;
end;
$$;

set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  t constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000a4';
  m constant uuid := 'aaaaaaaa-0000-4000-8000-0000000000a5';
  out jsonb;
  r record;
  n int;
begin
  -- 2. Accept: candidate becomes version 2, old one inactive, action + events recorded.
  out := public.apply_chat_action(a, t, m, 'b1', '{"type":"accept_routine"}');
  if out ->> 'result' <> 'applied' or (out #>> '{effect,version}')::int <> 2 then raise exception 'FAIL: 2 result %', out; end if;
  select * into r from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000a3';
  if not r.is_active or r.version <> 2 or r.source <> 'ai_proposal_accepted' or r.supersedes_routine_id <> 'aaaaaaaa-0000-4000-8000-0000000000a2' then
    raise exception 'FAIL: 2 candidate row %', to_jsonb(r); end if;
  if (select is_active from public.routines where id = 'aaaaaaaa-0000-4000-8000-0000000000a2') then
    raise exception 'FAIL: 2 old routine still active'; end if;
  select count(*) into n from public.chat_actions where message_id = m and block_id = 'b1' and result = 'applied';
  if n <> 1 then raise exception 'FAIL: 2 expected 1 applied action, got %', n; end if;
  select count(*) into n from public.profile_change_events
    where row_id = 'aaaaaaaa-0000-4000-8000-0000000000a3' and field = 'is_active' and source = 'ai_proposal_accepted';
  if n <> 1 then raise exception 'FAIL: 2 expected an ai_proposal_accepted event, got %', n; end if;

  -- 3. Replay → already_acted, nothing else changes.
  begin
    perform public.apply_chat_action(a, t, m, 'b1', '{"type":"accept_routine"}');
    raise exception 'FAIL: 3 replay accepted';
  exception when others then
    if sqlerrm <> 'already_acted' then raise exception 'FAIL: 3 expected already_acted, got %', sqlerrm; end if;
  end;
  select count(*) into n from public.chat_actions where message_id = m;
  if n <> 1 then raise exception 'FAIL: 3 expected 1 action row after replay, got %', n; end if;

  -- 4. B's candidate referenced from A's block → forbidden, no action row, candidate untouched.
  begin
    perform public.apply_chat_action(a, t, m, 'b6', '{"type":"accept_routine"}');
    raise exception 'FAIL: 4 accepted a foreign candidate';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: 4 expected forbidden, got %', sqlerrm; end if;
  end;
  if (select is_active from public.routines where id = 'bbbbbbbb-0000-4000-8000-0000000000b2') then
    raise exception 'FAIL: 4 B candidate activated'; end if;
  select count(*) into n from public.chat_actions where block_id = 'b6';
  if n <> 0 then raise exception 'FAIL: 4 action row written for a forbidden action'; end if;

  -- 5. confirm_change uses the stored field; a non-whitelisted field is rejected.
  out := public.apply_chat_action(a, t, m, 'b2', '{"type":"confirm_change"}');
  if (select budget from public.skin_profiles where user_id = a) <> 'mid' then raise exception 'FAIL: 5 budget not updated'; end if;
  select count(*) into n from public.profile_change_events where user_id = a and field = 'budget' and source = 'ai_proposal_accepted';
  if n <> 1 then raise exception 'FAIL: 5 expected ai_proposal_accepted budget event'; end if;
  begin
    perform public.apply_chat_action(a, t, m, 'b3', '{"type":"confirm_change"}');
    raise exception 'FAIL: 5 user_id change accepted';
  exception when others then
    if sqlerrm <> 'invalid_action' then raise exception 'FAIL: 5 expected invalid_action, got %', sqlerrm; end if;
  end;
  out := public.apply_chat_action(a, t, m, 'b7', '{"type":"confirm_change"}');
  if (select status from public.user_products where id = 'aaaaaaaa-0000-4000-8000-0000000000a1') <> 'paused' then
    raise exception 'FAIL: 5 product status not updated'; end if;

  -- 5b. Declines only log.
  select count(*) into n from public.chat_actions where result = 'rejected';
  if n <> 0 then raise exception 'FAIL: 5b unexpected rejected rows'; end if;
  begin
    perform public.apply_chat_action(a, t, m, 'b4', '{"type":"decline_routine"}');
    raise exception 'FAIL: 5b decline_routine on a product_card accepted';
  exception when others then
    if sqlerrm <> 'invalid_action' then raise exception 'FAIL: 5b expected invalid_action, got %', sqlerrm; end if;
  end;

  -- 6. add_product with a bad category → check violation, no row.
  begin
    perform public.apply_chat_action(a, t, m, 'b4', '{"type":"add_product","product":{"name":"New toner","category":"bogus"}}');
    raise exception 'FAIL: 6 bogus category accepted';
  exception when check_violation then null; end;
  select count(*) into n from public.user_products where name = 'New toner';
  if n <> 0 then raise exception 'FAIL: 6 product row written'; end if;
  out := public.apply_chat_action(a, t, m, 'b4', '{"type":"add_product","product":{"name":"New toner","category":"toner","key_actives":["aha"]}}');
  select * into r from public.user_products where id = (out #>> '{effect,product_id}')::uuid;
  if r.user_id <> a or r.key_actives <> array['aha'] or r.status <> 'active' then raise exception 'FAIL: 6 product %', to_jsonb(r); end if;
  select count(*) into n from public.profile_change_events where row_id = r.id and source = 'ai_proposal_accepted';
  if n <> 1 then raise exception 'FAIL: 6 expected ai_proposal_accepted insert event'; end if;

  -- 7. New reaction on B's product → forbidden.
  begin
    perform public.apply_chat_action(a, t, m, 'b5', '{"type":"confirm_change"}');
    raise exception 'FAIL: 7 reaction on a foreign product accepted';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception 'FAIL: 7 expected forbidden, got %', sqlerrm; end if;
  end;
  select count(*) into n from public.product_reactions where user_id = a;
  if n <> 0 then raise exception 'FAIL: 7 reaction row written'; end if;
end;
$$;

rollback;
