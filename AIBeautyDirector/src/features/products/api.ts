import { supabase } from '@/lib/supabase';
import { DataError } from '@/features/routine/api';
import { PRODUCT_STATUSES } from '@/features/onboarding/codes';
import { toInsert, type ProductFormInput, type ProductRow } from './schemas';

const COLUMNS = 'id, name, brand, category, use_time, key_actives, ingredients_text, opened_at, status, created_at';

type Res<T> = { data: T; error: { code: string } | null; status: number };
function check<T>(res: Res<T>): T {
  if (res.error) throw new DataError(res.status === 0, res.error.code);
  return res.data;
}

export const productsKey = (userId: string) => ['products', userId] as const;

// In use first, then paused, then finished; newest first inside a group.
export async function listProducts(userId: string): Promise<ProductRow[]> {
  const rows = check(await supabase.from('user_products').select(COLUMNS).eq('user_id', userId).order('created_at', { ascending: false })) ?? [];
  const rank = (s: string) => { const i = (PRODUCT_STATUSES as readonly string[]).indexOf(s); return i < 0 ? PRODUCT_STATUSES.length : i; };
  return [...rows].sort((a, b) => rank(a.status) - rank(b.status));
}

// Insert (id null) or update the user's own row; returns what was saved. Products are never deleted after
// onboarding (status 'finished' instead), see …31000001_products_reactions_v2.
export async function saveProduct(userId: string, id: string | null, v: ProductFormInput): Promise<ProductRow> {
  const row = toInsert(v);
  const q = id
    ? supabase.from('user_products').update(row).eq('id', id).eq('user_id', userId)
    : supabase.from('user_products').insert(row);
  const saved = check(await q.select(COLUMNS).single());
  if (!saved) throw new DataError(false, 'not_saved');
  return saved;
}
