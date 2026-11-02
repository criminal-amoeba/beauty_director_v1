import type { ReactionAnswer } from '@/features/onboarding/api';

// After onboarding, reactions are never deleted: a removed or changed one is resolved, a new one inserted,
// an unchanged one left alone (its history and change events stay intact).
export function diffReactions(saved: ReactionAnswer[], next: ReactionAnswer[]): { insert: ReactionAnswer[]; resolve: string[] } {
  const same = (a: ReactionAnswer, b: ReactionAnswer) => a.ingredient === b.ingredient && a.reaction === b.reaction && a.severity === b.severity;
  return {
    insert: next.filter((n) => !saved.some((s) => same(s, n))),
    resolve: saved.filter((s) => !next.some((n) => same(s, n))).map((s) => s.ingredient),
  };
}
