-- Weekly scans and their normalized metrics. Vendor-neutral: provider + versions are data, not column names.
-- Clients can only read. Writes come from Edge Functions (service role bypasses RLS),
-- which also enforce the 7-day rule and mark stale pending scans failed.

create table public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  provider text not null check (char_length(provider) between 1 and 40),
  provider_model_version text,
  capture_protocol_version text not null,
  provider_job_id text,
  image_path text,
  failure_code text,
  provider_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- an incomplete result can never be recorded as a success
  check (status <> 'succeeded' or (completed_at is not null and provider_model_version is not null)),
  unique (id, user_id)
);
create index scans_user_created_idx on public.scans (user_id, created_at desc);
-- At most one in-flight scan per user: a double tap can't pay the provider twice.
create unique index scans_one_in_flight on public.scans (user_id) where status in ('pending', 'processing');

create trigger scans_updated_at
  before update on public.scans
  for each row execute function private.set_updated_at();

alter table public.scans enable row level security;
revoke all on public.scans from anon, authenticated;
grant select on public.scans to authenticated;
create policy scans_select_own on public.scans
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.scan_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  scan_id uuid not null,
  metric_code text not null check (metric_code ~ '^[a-z][a-z0-9_]{1,62}$'), -- e.g. pore_visibility
  value numeric not null,
  metric_definition_version text not null,
  created_at timestamptz not null default now(),
  foreign key (scan_id, user_id) references public.scans (id, user_id) on delete cascade,
  unique (scan_id, metric_code)
);
create index scan_metrics_user_code_idx on public.scan_metrics (user_id, metric_code, created_at);

alter table public.scan_metrics enable row level security;
revoke all on public.scan_metrics from anon, authenticated;
grant select on public.scan_metrics to authenticated;
create policy scan_metrics_select_own on public.scan_metrics
  for select to authenticated using ((select auth.uid()) = user_id);
