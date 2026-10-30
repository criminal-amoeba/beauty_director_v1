import { supabase } from '@/lib/supabase';
import { DataError } from '@/features/routine/api';
import { DONE_STEP, loadOnboarding, saveStep, STEPS, type Answers, type ReactionAnswer, type SaveError } from '@/features/onboarding/api';
import { diffReactions } from './reactions';

export { diffReactions } from './reactions';

// Profile editing reuses the onboarding answers and writers: the same step components, the same rows.
export type Section = 'basics' | 'goals' | 'level' | 'budget';
export const SKIN_SECTIONS = ['goals', 'level', 'budget', 'reactions'] as const;
export type SkinSection = (typeof SKIN_SECTIONS)[number];

export async function loadProfile(userId: string): Promise<Answers> {
  const r = await loadOnboarding(userId);
  if (r === 'offline') throw new DataError(true);
  if (r === 'failed') throw new DataError(false);
  return r.answers;
}

// onboarding_step is already DONE_STEP, so saveStep only writes the section's columns.
export const saveSection = (userId: string, section: Section, answers: Answers): Promise<SaveError | null> =>
  saveStep(userId, STEPS.indexOf(section), answers, DONE_STEP);

const errorKey = (res: { error: { code: string } | null; status: number }): SaveError | null =>
  !res.error ? null : res.status === 0 ? 'auth.errors.network' : 'auth.errors.generic';

export async function saveReactions(userId: string, saved: ReactionAnswer[], next: ReactionAnswer[]): Promise<SaveError | null> {
  const { insert, resolve } = diffReactions(saved, next);
  if (resolve.length) {
    const err = errorKey(await supabase.from('product_reactions').update({ resolved_at: new Date().toISOString() })
      .eq('user_id', userId).is('product_id', null).is('resolved_at', null).in('ingredient', resolve));
    if (err) return err;
  }
  if (insert.length) {
    return errorKey(await supabase.from('product_reactions').insert(
      insert.map(({ ingredient, reaction, severity }) => ({ ingredient, reaction: reaction!, severity: severity! })),
    ));
  }
  return null;
}
