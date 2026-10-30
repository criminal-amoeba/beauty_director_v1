-- AM/PM routine templates, their steps, daily completions, and user-reported daily check-ins.
-- Streaks are derived from routine_completions in app code (no table).

create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period text not null check (period in ('am', 'pm')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index routines_user_id_idx on public.routines (user_id);
create unique index routines_one_active_per_period on public.routines (user_id, period) where is_active;

create trigger routines_updated_at
  before update on public.routines
  for each row execute function private.set_updated_at();

alter table public.routines enable row level security;
revoke all on public.routines from anon, authenticated;
grant select, insert, update, delete on public.routines to authenticated;
create policy routines_select_own on public.routines
  for select to authenticated using ((select auth.uid()) = user_id);
create policy routines_insert_own on public.routines
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy routines_update_own on public.routines
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy routines_delete_own on public.routines
  for delete to authenticated using ((select auth.uid()) = user_id);

create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid not null,
  position smallint not null check (position between 1 and 20),
  step_type text not null check (step_type in (
    'cleanse', 'tone', 'serum', 'treat', 'moisturize', 'protect', 'mask', 'other'
  )),
  name text check (char_length(name) between 1 and 80), -- optional custom label; else app shows step_type label
  product_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade,
  foreign key (product_id, user_id) references public.user_products (id, user_id) on delete set null (product_id),
  -- deferred so steps can be reordered in one statement/transaction
  constraint routine_steps_position_key unique (routine_id, position) deferrable initially deferred
);
create index routine_steps_user_id_idx on public.routine_steps (user_id);
create index routine_steps_product_id_idx on public.routine_steps (product_id);

create trigger routine_steps_updated_at
  before update on public.routine_steps
  for each row execute function private.set_updated_at();

alter table public.routine_steps enable row level security;
revoke all on public.routine_steps from anon, authenticated;
grant select, insert, update, delete on public.routine_steps to authenticated;
create policy routine_steps_select_own on public.routine_steps
  for select to authenticated using ((select auth.uid()) = user_id);
create policy routine_steps_insert_own on public.routine_steps
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy routine_steps_update_own on public.routine_steps
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy routine_steps_delete_own on public.routine_steps
  for delete to authenticated using ((select auth.uid()) = user_id);

-- One row per user/period/local day. The unique key makes offline-queue retries safe
-- (insert ... on conflict do nothing) and blocks double submits.
create table public.routine_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_id uuid,
  period text not null check (period in ('am', 'pm')),
  local_date date not null, -- the user's calendar day (user_settings.timezone), not UTC
  completed_step_ids uuid[] not null default '{}',
  skipped_step_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete set null (routine_id),
  unique (user_id, period, local_date)
);
create index routine_completions_routine_id_idx on public.routine_completions (routine_id);

alter table public.routine_completions enable row level security;
revoke all on public.routine_completions from anon, authenticated;
grant select, insert on public.routine_completions to authenticated;
create policy routine_completions_select_own on public.routine_completions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy routine_completions_insert_own on public.routine_completions
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- User-reported, never shown as measurements. 0 = none … 4 = a lot.
create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  local_date date not null,
  dryness smallint check (dryness between 0 and 4),
  oiliness smallint check (oiliness between 0 and 4),
  stinging smallint check (stinging between 0 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create trigger daily_checkins_updated_at
  before update on public.daily_checkins
  for each row execute function private.set_updated_at();

alter table public.daily_checkins enable row level security;
revoke all on public.daily_checkins from anon, authenticated;
grant select, insert, update on public.daily_checkins to authenticated;
create policy daily_checkins_select_own on public.daily_checkins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy daily_checkins_insert_own on public.daily_checkins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy daily_checkins_update_own on public.daily_checkins
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
