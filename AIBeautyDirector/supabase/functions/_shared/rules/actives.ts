// Product codes shared by the proposal engine and the chat function. Must match the check constraints in
// supabase/migrations (…03_products_reactions, …04_routines, …31000001_products_reactions_v2) and the app's
// src/features/onboarding/codes.ts (the app can't import this folder, so both copies are tested against i18n).

export const CATEGORIES = ['cleanser', 'toner', 'serum', 'moisturizer', 'sunscreen', 'treatment', 'mask', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

// Also the canonical order of steps inside a routine (sunscreen is AM only).
export const STEP_TYPES = ['cleanse', 'tone', 'serum', 'treat', 'moisturize', 'protect', 'mask', 'other'] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const CATEGORY_STEP: Record<Category, StepType> = {
  cleanser: 'cleanse',
  toner: 'tone',
  serum: 'serum',
  treatment: 'treat',
  moisturizer: 'moisturize',
  sunscreen: 'protect',
  mask: 'mask',
  other: 'other',
};

export const KEY_ACTIVES = [
  'retinoid', 'aha', 'bha', 'pha', 'vitamin_c', 'niacinamide', 'benzoyl_peroxide', 'azelaic_acid',
  'hyaluronic_acid', 'ceramides', 'peptides', 'sulfur', 'fragrance', 'alcohol_denat', 'essential_oils', 'unknown',
] as const;
export type KeyActive = (typeof KEY_ACTIVES)[number];

// Never count as a "new active" (don't introduce two new actives at once).
export const INERT_ACTIVES: readonly KeyActive[] = ['hyaluronic_acid', 'ceramides', 'peptides', 'unknown'];

// product_reactions.ingredient codes (onboarding list) → the product actives they cover.
export const INGREDIENT_ACTIVES: Readonly<Record<string, readonly KeyActive[]>> = {
  fragrance: ['fragrance'],
  alcohol: ['alcohol_denat'],
  essential_oils: ['essential_oils'],
  retinoids: ['retinoid'],
  exfoliating_acids: ['aha', 'bha', 'pha'],
  vitamin_c: ['vitamin_c'],
  benzoyl_peroxide: ['benzoyl_peroxide'],
  niacinamide: ['niacinamide'],
};

export const USE_TIMES = ['am', 'pm', 'both'] as const;
export const PRODUCT_STATUSES = ['active', 'paused', 'finished'] as const;

// skin_profiles / product_reactions codes (…02_profiles_settings_consents, …03_products_reactions).
export const GOALS = ['hydration', 'brightening', 'firmness', 'calm_redness', 'pore_visibility', 'anti_aging', 'oil_control', 'texture'] as const;
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const BUDGETS = ['low', 'mid', 'high'] as const;
export const TEXTURES = ['gel', 'lotion', 'cream', 'oil', 'balm'] as const;
export const REACTIONS = ['stinging', 'redness', 'breakouts', 'dryness', 'itching', 'other'] as const;
export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;

// Distinct non-inert actives across a set of products.
export const activesOf = (products: readonly { key_actives: readonly string[] }[]): string[] =>
  [...new Set(products.flatMap((p) => p.key_actives))].filter((a) => !(INERT_ACTIVES as readonly string[]).includes(a));
