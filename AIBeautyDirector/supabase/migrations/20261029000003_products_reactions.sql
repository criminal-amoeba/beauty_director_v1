-- Products the user owns, and reactions they've recorded (to a product and/or an ingredient).

create table public.user_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  brand text check (char_length(brand) <= 80),
  category text not null default 'other' check (category in (
    'cleanser', 'toner', 'serum', 'moisturizer', 'sunscreen', 'treatment', 'mask', 'other'
  )),
  is_active boolean not null default true,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id) -- target for composite FKs: children must belong to the same user
);
create index user_products_user_id_idx on public.user_products (user_id);

create trigger user_products_updated_at
  before update on public.user_products
  for each row execute function private.set_updated_at();

alter table public.user_products enable row level security;
revoke all on public.user_products from anon, authenticated;
grant select, insert, update, delete on public.user_products to authenticated;
create policy user_products_select_own on public.user_products
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_products_insert_own on public.user_products
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_products_update_own on public.user_products
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_products_delete_own on public.user_products
  for delete to authenticated using ((select auth.uid()) = user_id);

create table public.product_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid,
  ingredient text check (char_length(ingredient) between 1 and 80),
  reaction text not null check (reaction in ('stinging', 'redness', 'breakouts', 'dryness', 'itching', 'other')),
  severity text not null default 'mild' check (severity in ('mild', 'moderate', 'severe')),
  noted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (product_id, user_id) references public.user_products (id, user_id) on delete set null (product_id)
);
create index product_reactions_user_id_idx on public.product_reactions (user_id);
create index product_reactions_product_id_idx on public.product_reactions (product_id);

alter table public.product_reactions enable row level security;
revoke all on public.product_reactions from anon, authenticated;
grant select, insert, update, delete on public.product_reactions to authenticated;
create policy product_reactions_select_own on public.product_reactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy product_reactions_insert_own on public.product_reactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy product_reactions_update_own on public.product_reactions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy product_reactions_delete_own on public.product_reactions
  for delete to authenticated using ((select auth.uid()) = user_id);
