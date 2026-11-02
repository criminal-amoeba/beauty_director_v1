import { supabase } from '@/lib/supabase';
import type { AuthErrorKey } from '@/features/auth/schemas';
import {
  BUDGETS, CATEGORIES, GENDERS, GOALS, INGREDIENTS, LEVELS, POLICY_VERSION, PURPOSES, REACTIONS, SEVERITIES, TEXTURES, isOneOf,
  type Budget, type Goal, type Ingredient, type Level, type Purpose, type Reaction, type Severity, type Texture,
} from './codes';
import { toBirthDate, type Basics, type Product } from './schemas';

export const STEPS = ['consent', 'basics', 'goals', 'level', 'budget', 'reactions', 'products'] as const;
export const DONE_STEP = STEPS.length; // profiles.onboarding_step once finished

export type ReactionAnswer = { ingredient: Ingredient; reaction: Reaction | null; severity: Severity | null };
export type Answers = {
  consents: Record<Purpose, boolean>;
  basics: Basics;
  goals: Goal[];
  level: Level | null;
  budget: Budget | null;
  textures: Texture[];
  reactions: ReactionAnswer[];
  products: Product[];
};
export type SaveError = AuthErrorKey | 'onboarding.errors.under18';

// postgrest-js reports a failed fetch as status 0. 23514 on profiles = the 18+ trigger (other checks are mirrored in zod).
const errorKey = (res: { error: { code: string } | null; status: number }): SaveError | null =>
  !res.error ? null
  : res.status === 0 ? 'auth.errors.network'
  : res.error.code === '23514' ? 'onboarding.errors.under18'
  : 'auth.errors.generic';

// Saved answers plus the step to resume at, or why they couldn't be read.
export async function loadOnboarding(userId: string): Promise<{ step: number; answers: Answers } | 'offline' | 'failed'> {
  const [p, s, c, r, up] = await Promise.all([
    supabase.from('profiles').select('display_name, birth_date, gender, onboarding_step').eq('user_id', userId).single(),
    supabase.from('skin_profiles').select('goals, routine_level, budget, textures').eq('user_id', userId).single(),
    supabase.from('current_consents').select('purpose, granted').eq('user_id', userId),
    supabase.from('product_reactions').select('ingredient, reaction, severity').eq('user_id', userId).is('product_id', null).is('resolved_at', null),
    supabase.from('user_products').select('name, brand, category').eq('user_id', userId).order('created_at'),
  ]);
  const failed = [p, s, c, r, up].find((res) => res.error);
  if (failed) return failed.status === 0 ? 'offline' : 'failed';
  if (!p.data || !s.data || !c.data || !r.data || !up.data) return 'failed'; // unreachable; narrows the types
  const [year = '', month = '', day = ''] = p.data.birth_date?.split('-') ?? [];
  const granted = (purpose: Purpose) => !!c.data.find((row) => row.purpose === purpose)?.granted;
  return {
    step: Math.min(p.data.onboarding_step, STEPS.length - 1),
    answers: {
      consents: {
        terms: granted('terms'),
        photo_analysis: granted('photo_analysis'),
        model_training: granted('model_training'),
        marketing: granted('marketing'),
      },
      basics: {
        name: p.data.display_name ?? '',
        year,
        month: month.replace(/^0/, ''),
        day: day.replace(/^0/, ''),
        gender: isOneOf(GENDERS, p.data.gender) ? p.data.gender : null,
      },
      goals: s.data.goals.filter((g) => isOneOf(GOALS, g)),
      level: isOneOf(LEVELS, s.data.routine_level) ? s.data.routine_level : null,
      budget: isOneOf(BUDGETS, s.data.budget) ? s.data.budget : null,
      textures: s.data.textures.filter((x) => isOneOf(TEXTURES, x)),
      reactions: r.data.flatMap((row) =>
        isOneOf(INGREDIENTS, row.ingredient) && isOneOf(REACTIONS, row.reaction) && isOneOf(SEVERITIES, row.severity)
          ? [{ ingredient: row.ingredient, reaction: row.reaction, severity: row.severity }]
          : []),
      products: up.data.flatMap((row) =>
        isOneOf(CATEGORIES, row.category) ? [{ name: row.name, brand: row.brand ?? '', category: row.category }] : []),
    },
  };
}

// Writes the answers of `step`, then moves onboarding_step forward (never back) to where a restart resumes.
export async function saveStep(userId: string, step: number, a: Answers, reached: number): Promise<SaveError | null> {
  const next = Math.max(reached, step + 1);
  const profile = () => supabase.from('profiles');
  const skin = () => supabase.from('skin_profiles');
  let err: SaveError | null = null;
  switch (STEPS[step]) {
    case 'consent':
      // Insert-only log: each submit records the current decision for every purpose.
      err = errorKey(await supabase.from('consents').insert(
        PURPOSES.map((purpose) => ({ purpose, granted: a.consents[purpose], policy_version: POLICY_VERSION })),
      ));
      break;
    case 'basics':
      return errorKey(await profile().update({
        display_name: a.basics.name.trim(),
        birth_date: toBirthDate(a.basics.year, a.basics.month, a.basics.day),
        gender: a.basics.gender,
        onboarding_step: next,
      }).eq('user_id', userId));
    case 'goals':
      err = errorKey(await skin().update({ goals: a.goals }).eq('user_id', userId));
      break;
    case 'level':
      err = errorKey(await skin().update({ routine_level: a.level }).eq('user_id', userId));
      break;
    case 'budget':
      err = errorKey(await skin().update({ budget: a.budget, textures: a.textures }).eq('user_id', userId));
      break;
    case 'reactions': {
      // Replace: nothing else writes reactions before onboarding is finished.
      err = errorKey(await supabase.from('product_reactions').delete().eq('user_id', userId).is('product_id', null));
      if (!err && a.reactions.length) {
        err = errorKey(await supabase.from('product_reactions').insert(
          a.reactions.map(({ ingredient, reaction, severity }) => ({ ingredient, reaction: reaction!, severity: severity! })),
        ));
      }
      break;
    }
    case 'products': {
      // Replace, like reactions: nothing else writes products before onboarding is finished.
      err = errorKey(await supabase.from('user_products').delete().eq('user_id', userId));
      if (!err && a.products.length) {
        err = errorKey(await supabase.from('user_products').insert(
          a.products.map(({ name, brand, category }) => ({ name, brand: brand || null, category })),
        ));
      }
      break;
    }
    default:
      return 'auth.errors.generic';
  }
  return err ?? errorKey(await profile().update({ onboarding_step: next }).eq('user_id', userId));
}

export async function finishOnboarding(userId: string): Promise<SaveError | null> {
  return errorKey(await supabase.from('profiles')
    .update({ onboarding_completed: true, onboarding_step: DONE_STEP })
    .eq('user_id', userId));
}
