import type { DiffStep } from './blocks';
import type { StepType } from '@/features/routine/steps';

export type Step = { step_type: StepType; product_name: string | null; position: number };
type Diff = { added: DiffStep[]; removed: DiffStep[]; moved: DiffStep[] };

const key = (s: { step_type: string; product_name: string | null }) => `${s.step_type}|${s.product_name ?? ''}`;
const byPosition = (a: Step, b: Step) => a.position - b.position;

// The proposal diff (server, rules/proposal.ts): `removed` carries old positions, `added` and `moved` carry
// positions in the new version. "After" = current − removed, with moved positions applied, + added.
export function applyDiff(current: Step[], diff: Diff): { before: Step[]; after: Step[] } {
  const before = [...current].sort(byPosition);
  const removed = new Set(diff.removed.map(key));
  const moved = new Map(diff.moved.map((s) => [key(s), s.position]));
  const after = [
    ...before.filter((s) => !removed.has(key(s))).map((s) => ({ ...s, position: moved.get(key(s)) ?? s.position })),
    ...diff.added.map((s) => ({ step_type: s.step_type, product_name: s.product_name, position: s.position })),
  ].sort(byPosition);
  return { before, after };
}
