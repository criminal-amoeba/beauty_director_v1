// Must match the check constraints in supabase/migrations (…02_profiles_settings_consents, …03_products_reactions).
// Labels live in i18n under codes.<group>.<code>.
export const GENDERS = ['female', 'male', 'non_binary', 'prefer_not_to_say'] as const;
export const GOALS = [
  'hydration', 'brightening', 'firmness', 'calm_redness', 'pore_visibility', 'anti_aging', 'oil_control', 'texture',
] as const;
export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export const BUDGETS = ['low', 'mid', 'high'] as const;
export const TEXTURES = ['gel', 'lotion', 'cream', 'oil', 'balm'] as const;
export const REACTIONS = ['stinging', 'redness', 'breakouts', 'dryness', 'itching', 'other'] as const;
export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export const CATEGORIES = ['cleanser', 'toner', 'serum', 'moisturizer', 'sunscreen', 'treatment', 'mask', 'other'] as const;
export const PURPOSES = ['terms', 'photo_analysis', 'model_training', 'marketing'] as const;
// Products v2 (…31000001_products_reactions_v2) and user_settings.persona.
export const KEY_ACTIVES = [
  'retinoid', 'aha', 'bha', 'pha', 'vitamin_c', 'niacinamide', 'benzoyl_peroxide', 'azelaic_acid',
  'hyaluronic_acid', 'ceramides', 'peptides', 'sulfur', 'fragrance', 'alcohol_denat', 'essential_oils', 'unknown',
] as const;
export const USE_TIMES = ['am', 'pm', 'both'] as const;
export const PRODUCT_STATUSES = ['active', 'paused', 'finished'] as const;
export const PERSONAS = ['gentle', 'professional', 'strict_coach'] as const;
// Onboarding can't continue without these.
export const REQUIRED_PURPOSES: readonly Purpose[] = ['terms', 'photo_analysis'];
// App-side list: product_reactions.ingredient is free text in the DB (products will add their own later).
export const INGREDIENTS = [
  'fragrance', 'alcohol', 'essential_oils', 'retinoids', 'exfoliating_acids', 'vitamin_c', 'benzoyl_peroxide', 'niacinamide',
] as const;

// Bump when the consent copy, Terms or Privacy Policy (en + zh-TW) change; every consent row records it.
export const POLICY_VERSION = '2026-10-30';

export type Gender = (typeof GENDERS)[number];
export type Goal = (typeof GOALS)[number];
export type Level = (typeof LEVELS)[number];
export type Budget = (typeof BUDGETS)[number];
export type Texture = (typeof TEXTURES)[number];
export type Reaction = (typeof REACTIONS)[number];
export type Severity = (typeof SEVERITIES)[number];
export type Purpose = (typeof PURPOSES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Ingredient = (typeof INGREDIENTS)[number];
export type KeyActive = (typeof KEY_ACTIVES)[number];
export type UseTime = (typeof USE_TIMES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type Persona = (typeof PERSONAS)[number];

export const isOneOf = <C extends string>(codes: readonly C[], v: unknown): v is C => codes.includes(v as C);
