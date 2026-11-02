import { z } from 'zod';
import { CATEGORIES, KEY_ACTIVES, PRODUCT_STATUSES, USE_TIMES } from '@/features/onboarding/codes';
import type { Tables, TablesInsert } from '@/types/database';

export type ProductRow = Pick<
  Tables<'user_products'>,
  'id' | 'name' | 'brand' | 'category' | 'use_time' | 'key_actives' | 'ingredients_text' | 'opened_at' | 'status' | 'created_at'
>;

// 'YYYY-MM-DD', a real date from 2000 up to today (the DB only checks the lower bound).
export function isValidPastDate(s: string, today = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return y >= 2000 && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && date.getTime() <= today.getTime();
}

// Error messages are i18n keys. Limits mirror user_products (…31000001_products_reactions_v2).
export const productFormSchema = z
  .object({
    name: z.string().trim().min(1, 'auth.validation.required').max(120, 'onboarding.validation.productNameLong'),
    brand: z.string().trim().max(80, 'onboarding.validation.brandLong'),
    category: z.enum(CATEGORIES).nullable(),
    use_time: z.enum(USE_TIMES),
    key_actives: z.array(z.enum(KEY_ACTIVES)),
    ingredients_text: z.string().trim().max(2000, 'products.validation.ingredientsLong'),
    opened_at: z.string().trim(),
    status: z.enum(PRODUCT_STATUSES),
  })
  .superRefine((v, ctx) => {
    if (!v.category) ctx.addIssue({ code: 'custom', path: ['category'], message: 'onboarding.validation.choose' });
    if (v.opened_at && !isValidPastDate(v.opened_at)) ctx.addIssue({ code: 'custom', path: ['opened_at'], message: 'products.validation.date' });
  });

export type ProductFormInput = z.input<typeof productFormSchema>;

export const emptyProduct: ProductFormInput = { name: '', brand: '', category: null, use_time: 'both', key_actives: [], ingredients_text: '', opened_at: '', status: 'active' };

export const toFormInput = (row: ProductRow | null): ProductFormInput =>
  row
    ? {
        name: row.name,
        brand: row.brand ?? '',
        category: (CATEGORIES as readonly string[]).includes(row.category) ? (row.category as ProductFormInput['category']) : null,
        use_time: (USE_TIMES as readonly string[]).includes(row.use_time) ? (row.use_time as ProductFormInput['use_time']) : 'both',
        key_actives: row.key_actives.filter((a): a is ProductFormInput['key_actives'][number] => (KEY_ACTIVES as readonly string[]).includes(a)),
        ingredients_text: row.ingredients_text ?? '',
        opened_at: row.opened_at ?? '',
        status: (PRODUCT_STATUSES as readonly string[]).includes(row.status) ? (row.status as ProductFormInput['status']) : 'active',
      }
    : emptyProduct;

// Validated form → row columns (user_id comes from the column default). Empty strings become null.
export const toInsert = (v: ProductFormInput): Omit<TablesInsert<'user_products'>, 'user_id' | 'id'> => ({
  name: v.name.trim(),
  brand: v.brand.trim() || null,
  category: v.category ?? 'other',
  use_time: v.use_time,
  key_actives: v.key_actives,
  ingredients_text: v.ingredients_text.trim() || null,
  opened_at: v.opened_at.trim() || null,
  status: v.status,
});
