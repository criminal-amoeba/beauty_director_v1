-- Structured chat (step 10 §C): assistant messages carry `blocks` (validated JSON built by the chat function;
-- ids inside are always server-resolved), taps on them are logged in chat_actions (server-only writes, one row per
-- block, so a replay fails), threads keep an AI-generated summary and a busy flag (one in-flight request per thread).
-- active_conflict_rules is the ingredient-conflict table: seeded EMPTY, rows arrive only by a later migration.

alter table public.chat_messages
  add column blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array');

alter table public.chat_threads
  add column summary text check (char_length(summary) <= 2000),
  add column summary_through_message_id uuid,
  add column busy_until timestamptz;

create table public.chat_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null,
  message_id uuid not null,
  block_id text not null check (block_id ~ '^b[0-9]{1,2}$'),
  action jsonb not null,
  result text not null check (result in ('applied', 'rejected')),
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.chat_threads (id, user_id) on delete cascade,
  foreign key (message_id) references public.chat_messages (id) on delete cascade,
  unique (message_id, block_id) -- a second tap on the same block is a replay (23505)
);
create index chat_actions_user_id_idx on public.chat_actions (user_id);

alter table public.chat_actions enable row level security;
revoke all on public.chat_actions from anon, authenticated;
grant select on public.chat_actions to authenticated;
create policy chat_actions_select_own on public.chat_actions
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.active_conflict_rules (
  active_a text not null,
  active_b text not null,
  rule text not null check (rule in ('never_same_routine', 'never_same_day', 'ask_first')),
  note text check (char_length(note) <= 200),
  primary key (active_a, active_b),
  check (active_a < active_b) -- one row per unordered pair
);

alter table public.active_conflict_rules enable row level security;
revoke all on public.active_conflict_rules from anon, authenticated;
grant select on public.active_conflict_rules to authenticated;
create policy active_conflict_rules_select_all on public.active_conflict_rules
  for select to authenticated using (true);
