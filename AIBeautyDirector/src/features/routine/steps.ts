import type { Category, Goal, Level } from '@/features/onboarding/codes';

// Must match the check constraints in supabase/migrations/…04_routines.sql. Labels: codes.stepType.<code>.
export const PERIODS = ['am', 'pm'] as const;
export const STEP_TYPES = ['cleanse', 'tone', 'serum', 'treat', 'moisturize', 'protect', 'mask', 'other'] as const;
export type Period = (typeof PERIODS)[number];
export type StepType = (typeof STEP_TYPES)[number];

// Typed by the stored goal codes, so a key that doesn't match a code (the old 'hydrate' vs 'Hydrate' bug) won't compile.
// Retinoid-type goals go to the PM treat slot only; one treat step at most, so no two new actives at once.
const GOAL_STEP: Record<Goal, { am: 'serum' | null; pm: 'serum' | 'treat' }> = {
  hydration: { am: 'serum', pm: 'serum' },
  brightening: { am: 'serum', pm: 'serum' },
  calm_redness: { am: 'serum', pm: 'serum' },
  oil_control: { am: 'serum', pm: 'serum' },
  pore_visibility: { am: 'serum', pm: 'treat' },
  firmness: { am: null, pm: 'treat' },
  anti_aging: { am: null, pm: 'treat' },
  texture: { am: null, pm: 'treat' },
};

const CATEGORY_STEP: Record<Category, StepType> = {
  cleanser: 'cleanse',
  toner: 'tone',
  serum: 'serum',
  treatment: 'treat',
  moisturizer: 'moisturize',
  sunscreen: 'protect',
  mask: 'mask',
  other: 'other',
};

export type StepDraft = { position: number; step_type: StepType; product_id: string | null };
type SkinInput = { goals: Goal[]; level: Level | null };
type OwnedProduct = { id: string; category: Category };

// The first routine for a period, built from onboarding answers. Each step links an owned product of its kind.
export function buildDefaultSteps(period: Period, skin: SkinInput, products: OwnedProduct[]): StepDraft[] {
  const slots = skin.goals.map((g) => GOAL_STEP[g][period]);
  const middle: StepType | null = slots.includes('treat') ? 'treat' : slots.includes('serum') ? 'serum' : null;
  const types: StepType[] = [
    'cleanse',
    ...(skin.level && skin.level !== 'beginner' ? (['tone'] as const) : []),
    ...(middle ? [middle] : []),
    'moisturize',
    ...(period === 'am' ? (['protect'] as const) : []),
  ];
  return types.map((step_type, i) => ({
    position: i + 1,
    step_type,
    product_id: products.find((p) => CATEGORY_STEP[p.category] === step_type)?.id ?? null,
  }));
}
