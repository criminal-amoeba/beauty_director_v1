-- Chat history. Clients can only read; the chat and run-weekly-scan Edge Functions write
-- both user and assistant messages (length limits, injection handling, token logging live there).

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  origin text not null default 'chat' check (origin in ('chat', 'weekly_scan')),
  scan_id uuid,
  title text check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (scan_id, user_id) references public.scans (id, user_id) on delete set null (scan_id)
);
create index chat_threads_user_recent_idx on public.chat_threads (user_id, last_message_at desc);
-- One review thread per scan, so a retried weekly-scan run can't create duplicates.
create unique index chat_threads_one_per_scan on public.chat_threads (scan_id) where scan_id is not null;

alter table public.chat_threads enable row level security;
revoke all on public.chat_threads from anon, authenticated;
grant select on public.chat_threads to authenticated;
create policy chat_threads_select_own on public.chat_threads
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  thread_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  model text,
  prompt_tokens integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  created_at timestamptz not null default now(),
  foreign key (thread_id, user_id) references public.chat_threads (id, user_id) on delete cascade
);
create index chat_messages_thread_recent_idx on public.chat_messages (thread_id, created_at desc);
create index chat_messages_user_id_idx on public.chat_messages (user_id);

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
create policy chat_messages_select_own on public.chat_messages
  for select to authenticated using ((select auth.uid()) = user_id);
