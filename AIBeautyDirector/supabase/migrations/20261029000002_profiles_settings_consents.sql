-- Profiles, settings, skin profile (1:1 with auth.users, created by trigger) and the consent log.
-- Option columns store stable English codes; the app maps them to en / zh-TW labels.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 50),
  birth_date date check (birth_date >= '1900-01-01'),
  gender text check (gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 20),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.check_adult()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- current_date is UTC: for Taiwan (UTC+8) this is at most a few hours stricter, never looser.
  if new.birth_date is not null and new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'user must be 18 or older' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_check_adult
  before insert or update of birth_date on public.profiles
  for each row execute function private.check_adult();
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── user_settings ───────────────────────────────────────────────────────────
create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  persona text not null default 'gentle' check (persona in ('gentle', 'professional', 'strict_coach')),
  locale text not null default 'zh-TW' check (locale in ('en', 'zh-TW')),
  timezone text not null default 'Asia/Taipei',
  am_reminder_enabled boolean not null default false,
  am_reminder_time time not null default '08:00',
  pm_reminder_enabled boolean not null default false,
  pm_reminder_time time not null default '21:30',
  scan_reminder_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function private.check_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.timezone; -- raises on an unknown IANA name
  return new;
end;
$$;

create trigger user_settings_check_timezone
  before insert or update of timezone on public.user_settings
  for each row execute function private.check_timezone();
create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute function private.set_updated_at();

alter table public.user_settings enable row level security;
revoke all on public.user_settings from anon, authenticated;
grant select, update on public.user_settings to authenticated;
create policy user_settings_select_own on public.user_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── skin_profiles ───────────────────────────────────────────────────────────
create table public.skin_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  goals text[] not null default '{}' check (goals <@ array[
    'hydration', 'brightening', 'firmness', 'calm_redness', 'pore_visibility',
    'anti_aging', 'oil_control', 'texture'
  ]),
  routine_level text check (routine_level in ('beginner', 'intermediate', 'advanced')),
  budget text check (budget in ('low', 'mid', 'high')),
  textures text[] not null default '{}' check (textures <@ array['gel', 'lotion', 'cream', 'oil', 'balm']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger skin_profiles_updated_at
  before update on public.skin_profiles
  for each row execute function private.set_updated_at();

alter table public.skin_profiles enable row level security;
revoke all on public.skin_profiles from anon, authenticated;
grant select, update on public.skin_profiles to authenticated;
create policy skin_profiles_select_own on public.skin_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy skin_profiles_update_own on public.skin_profiles
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── consents (append-only audit log) ────────────────────────────────────────
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purpose text not null check (purpose in ('photo_analysis', 'model_training', 'marketing')),
  granted boolean not null,
  policy_version text not null check (char_length(policy_version) between 1 and 32),
  created_at timestamptz not null default now()
);
create index consents_user_purpose_idx on public.consents (user_id, purpose, created_at desc);

alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated;
grant select on public.consents to authenticated;
-- Column grant: clients can't backdate created_at or write for someone else (user_id comes from the default).
grant insert (purpose, granted, policy_version) on public.consents to authenticated;
create policy consents_select_own on public.consents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy consents_insert_own on public.consents
  for insert to authenticated with check ((select auth.uid()) = user_id);

create view public.current_consents with (security_invoker = true) as
  select distinct on (user_id, purpose) user_id, purpose, granted, policy_version, created_at
  from public.consents
  order by user_id, purpose, created_at desc;
revoke all on public.current_consents from anon, authenticated;
grant select on public.current_consents to authenticated;

-- ── new-user trigger ────────────────────────────────────────────────────────
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  insert into public.skin_profiles (user_id) values (new.id);
  -- Signup sends the device language as metadata.locale; anything not English falls back to zh-TW.
  insert into public.user_settings (user_id, locale)
  values (new.id, case when new.raw_user_meta_data ->> 'locale' ilike 'en%' then 'en' else 'zh-TW' end);
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill users created before this migration (no-op on a fresh project).
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;
insert into public.skin_profiles (user_id) select id from auth.users on conflict do nothing;
insert into public.user_settings (user_id) select id from auth.users on conflict do nothing;
