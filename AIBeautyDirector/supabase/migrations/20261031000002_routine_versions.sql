-- Routine versions are rows (step 10 §D). A new version is a new routine row (+ steps); the previous one stays
-- inactive as history (completions already point at their routine_id). Candidates built by the chat function
-- are inactive rows with version null and source 'system'; accepting one (apply_chat_action) sets version = max + 1,
-- flips is_active and records source 'ai_proposal_accepted'. Clients can never claim that source. No deletes.

alter table public.routines
  add column version smallint check (version >= 1),
  add column supersedes_routine_id uuid,
  add column source text not null default 'user' check (source in ('system', 'user', 'ai_proposal_accepted')),
  add foreign key (supersedes_routine_id, user_id) references public.routines (id, user_id) on delete set null (supersedes_routine_id);

-- Existing rows: number them per user/period in creation order (the app only ever created one per period).
update public.routines r
set version = v.rn
from (select id, row_number() over (partition by user_id, period order by created_at, id) as rn from public.routines) v
where v.id = r.id;

alter table public.routines add constraint routines_active_has_version check (not is_active or version is not null);
create unique index routines_user_period_version on public.routines (user_id, period, version) where version is not null;

drop policy routines_insert_own on public.routines;
create policy routines_insert_own on public.routines
  for insert to authenticated
  with check ((select auth.uid()) = user_id and source <> 'ai_proposal_accepted');
drop policy routines_update_own on public.routines;
create policy routines_update_own on public.routines
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and source <> 'ai_proposal_accepted');
drop policy routines_delete_own on public.routines;
revoke delete on public.routines from authenticated;
