import { z } from 'zod';
import { CATEGORIES, GENDERS, type Category } from './codes';

// 'YYYY-MM-DD' for a real calendar date from 1900 up to today, else null. Age 18+ is checked by the DB trigger only.
export function toBirthDate(year: string, month: string, day: string, today = new Date()): string | null {
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return null;
  const [y, m, d] = [Number(year), Number(month), Number(day)];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || date.getTime() > today.getTime()) return null;
  return date.toISOString().slice(0, 10);
}

// Error messages are i18n keys, translated where they are shown.
export const basicsSchema = z
  .object({
    name: z.string().trim().min(1, 'auth.validation.required').max(50, 'onboarding.validation.nameLong'),
    year: z.string(),
    month: z.string(),
    day: z.string(),
    gender: z.enum(GENDERS).nullable(),
  })
  .superRefine((v, ctx) => {
    if (!toBirthDate(v.year, v.month, v.day)) ctx.addIssue({ code: 'custom', path: ['year'], message: 'onboarding.validation.date' });
    if (!v.gender) ctx.addIssue({ code: 'custom', path: ['gender'], message: 'onboarding.validation.choose' });
  });

export type Basics = z.input<typeof basicsSchema>;

// Typed in by the user (no product catalog yet). Limits mirror user_products.
export const productSchema = z
  .object({
    name: z.string().trim().min(1, 'auth.validation.required').max(120, 'onboarding.validation.productNameLong'),
    brand: z.string().trim().max(80, 'onboarding.validation.brandLong'),
    category: z.enum(CATEGORIES).nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.category) ctx.addIssue({ code: 'custom', path: ['category'], message: 'onboarding.validation.choose' });
  });

export type ProductInput = z.input<typeof productSchema>;
export type Product = { name: string; brand: string; category: Category };
