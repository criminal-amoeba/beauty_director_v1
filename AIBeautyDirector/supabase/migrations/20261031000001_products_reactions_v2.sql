-- Products v2 (step 10, My products): `status` replaces `is_active`; usage and actives metadata; reactions are
-- resolved, never deleted. Deleting products / reactions stays possible only while onboarding is unfinished
-- (the wizard replaces on submit); afterwards rows are history: products change status, reactions get resolved_at.

-- ── user_products ───────────────────────────────────────────────────────────
alter table public.user_products
  add column status text not null default 'active' check (status in ('active', 'paused', 'finished')),
  add column use_time text not null default 'both' check (use_time in ('am', 'pm', 'both')),
  add column key_actives text[] not null default '{}' check (key_actives <@ array[
    'retinoid', 'aha', 'bha', 'pha', 'vitamin_c', 'niacinamide', 'benzoyl_peroxide', 'azelaic_acid',
    'hyaluronic_acid', 'ceramides', 'peptides', 'sulfur', 'fragrance', 'alcohol_denat', 'essential_oils', 'unknown'
  ]),
  add column ingredients_text text check (char_length(ingredients_text) <= 2000),
  add column opened_at date check (opened_at >= '2000-01-01'),
  add column catalog_product_id uuid; -- future product catalog; no FK until that table exists

update public.user_products set status = 'finished' where not is_active;
alter table public.user_products drop column is_active;
create index user_products_user_status_idx on public.user_products (user_id, status);

drop policy user_products_delete_own on public.user_products;
create policy user_products_delete_onboarding on public.user_products
  for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and not p.onboarding_completed
    )
  );

-- ── product_reactions ───────────────────────────────────────────────────────
alter table public.product_reactions add column resolved_at timestamptz;
create index product_reactions_active_idx on public.product_reactions (user_id) where resolved_at is null;

drop policy product_reactions_delete_own on public.product_reactions;
create policy product_reactions_delete_onboarding on public.product_reactions
  for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and not p.onboarding_completed
    )
  );
