-- Terms of Service + Privacy Policy agreement, recorded like the other consents (onboarding step 1, required).
-- One purpose covers both documents: they are accepted together under one policy_version.
-- Existing rows, RLS and grants are unchanged (insert-only for users).

alter table public.consents drop constraint consents_purpose_check;
alter table public.consents add constraint consents_purpose_check
  check (purpose in ('terms', 'photo_analysis', 'model_training', 'marketing'));
