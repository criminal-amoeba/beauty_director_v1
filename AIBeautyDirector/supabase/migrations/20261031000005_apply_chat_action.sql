-- The only path by which an AI suggestion changes user data (step 10 §C/§D/§E). Called by the chat Edge
-- Function (service role) after the user tapped a block. Everything comes from the STORED block, never from the
-- request: candidate routine ids, change fields and values. Runs in one transaction with
-- app.change_source = 'ai_proposal_accepted', so the change-event trigger records the source, and the
-- chat_actions row is written last: a replay (same message + block) hits the unique key and rolls everything back.
-- Errors are codes in the message: 'forbidden' (not the caller's rows), 'invalid_action' (not allowed on this
-- block), 'already_acted' (this block was tapped before).

create or replace function public.apply_chat_action(
  p_user_id uuid,
  p_thread_id uuid,
  p_message_id uuid,
  p_block_id text,
  p_action jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := p_action ->> 'type';
  blk jsonb;
  res text := 'applied';
  effect jsonb := null;
  cand record;
  old_id uuid;
  v int;
  entity text;
  field text;
  val jsonb;
  rid uuid;
  pid uuid;
  new_id uuid;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  perform set_config('app.change_source', 'ai_proposal_accepted', true);

  select b into blk
  from public.chat_messages m, jsonb_array_elements(m.blocks) b
  where m.id = p_message_id and m.thread_id = p_thread_id and m.user_id = p_user_id and m.role = 'assistant'
    and b ->> 'id' = p_block_id;
  if blk is null then raise exception 'forbidden'; end if;
  if exists (select 1 from public.chat_actions where message_id = p_message_id and block_id = p_block_id) then
    raise exception 'already_acted';
  end if;

  if not (
    (kind in ('accept_routine', 'decline_routine') and blk ->> 'type' = 'routine_proposal')
    or (kind in ('confirm_change', 'decline_change') and blk ->> 'type' = 'confirm_change')
    or (kind = 'add_product' and blk ->> 'type' = 'product_card' and blk ->> 'mode' = 'suggest_add')
  ) then
    raise exception 'invalid_action';
  end if;

  case kind
  when 'accept_routine' then
    select r.id, r.period into cand
    from public.routines r
    where r.id = (blk ->> 'candidate_routine_id')::uuid and r.user_id = p_user_id
      and not r.is_active and r.source = 'system';
    if not found then raise exception 'forbidden'; end if;

    update public.routines set is_active = false
    where user_id = p_user_id and period = cand.period and is_active
    returning id into old_id;
    select coalesce(max(version), 0) + 1 into v from public.routines where user_id = p_user_id and period = cand.period;
    update public.routines
    set is_active = true, source = 'ai_proposal_accepted', supersedes_routine_id = old_id, version = v
    where id = cand.id;
    effect := jsonb_build_object('routine_id', cand.id, 'version', v);

  when 'decline_routine', 'decline_change' then
    res := 'rejected';

  when 'add_product' then
    insert into public.user_products (user_id, name, brand, category, use_time, key_actives, ingredients_text, opened_at)
    values (
      p_user_id,
      p_action #>> '{product,name}',
      nullif(p_action #>> '{product,brand}', ''),
      coalesce(p_action #>> '{product,category}', 'other'),
      coalesce(p_action #>> '{product,use_time}', 'both'),
      array(select jsonb_array_elements_text(coalesce(p_action #> '{product,key_actives}', '[]'::jsonb))),
      nullif(p_action #>> '{product,ingredients_text}', ''),
      nullif(p_action #>> '{product,opened_at}', '')::date
    )
    returning id into new_id;
    effect := jsonb_build_object('product_id', new_id);

  when 'confirm_change' then
    entity := blk ->> 'entity';
    field := blk ->> 'field';
    val := blk -> 'new_value';
    rid := (blk ->> 'row_id')::uuid;

    if entity = 'skin_profile' and field in ('goals', 'textures') then
      execute format('update public.skin_profiles set %I = $1 where user_id = $2', field)
      using array(select jsonb_array_elements_text(val)), p_user_id;
    elsif entity = 'skin_profile' and field in ('routine_level', 'budget') then
      execute format('update public.skin_profiles set %I = $1 where user_id = $2', field)
      using val #>> '{}', p_user_id;
    elsif entity = 'product' and field in ('status', 'use_time') then
      execute format('update public.user_products set %I = $1 where id = $2 and user_id = $3', field)
      using val #>> '{}', rid, p_user_id;
    elsif entity = 'product' and field = 'key_actives' then
      update public.user_products set key_actives = array(select jsonb_array_elements_text(val))
      where id = rid and user_id = p_user_id;
    elsif entity = 'product' and field = 'opened_at' then
      update public.user_products set opened_at = (val #>> '{}')::date
      where id = rid and user_id = p_user_id;
    elsif entity = 'reaction' and field = 'resolved_at' then
      update public.product_reactions set resolved_at = now()
      where id = rid and user_id = p_user_id and resolved_at is null;
    elsif entity = 'reaction' and field = 'new' then
      pid := nullif(val ->> 'product_id', '')::uuid;
      if pid is not null and not exists (select 1 from public.user_products where id = pid and user_id = p_user_id) then
        raise exception 'forbidden';
      end if;
      insert into public.product_reactions (user_id, product_id, ingredient, reaction, severity)
      values (p_user_id, pid, nullif(val ->> 'ingredient', ''), val ->> 'reaction', coalesce(val ->> 'severity', 'mild'))
      returning id into new_id;
      effect := jsonb_build_object('reaction_id', new_id);
    else
      raise exception 'invalid_action';
    end if;

    if not (entity = 'reaction' and field = 'new') then
      get diagnostics v = row_count; -- the update just above
      if v = 0 then raise exception 'forbidden'; end if;
    end if;

  else
    raise exception 'invalid_action';
  end case;

  insert into public.chat_actions (user_id, thread_id, message_id, block_id, action, result)
  values (p_user_id, p_thread_id, p_message_id, p_block_id, p_action, res);

  return jsonb_build_object('result', res, 'effect', effect);
end;
$$;

revoke execute on function public.apply_chat_action(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
