// Routine proposals (step 10 §D), pure. The LLM only ever expresses an intent with product NAMES; this engine
// resolves names to the user's own products, applies the safety constraints in a fixed order and returns the
// steps of a candidate version plus a diff, or a rejection the chat function turns into "no block".
// Order: resolve product → active reactions → sunscreen AM-only → at most one new active (AM+PM together) →
// ingredient conflict rules (table, empty in V1) → unknown-actives products → canonical step order → diff.
import { activesOf, CATEGORY_STEP, INGREDIENT_ACTIVES, STEP_TYPES, type Category, type StepType } from './actives.ts';

export type ProposalIntent = {
  kind: 'add' | 'remove' | 'reorder' | 'simplify';
  period: 'am' | 'pm';
  product_name?: string;
  step_type?: StepType;
  reason: string;
};
export type ProposalProduct = { id: string; name: string; brand: string | null; category: Category; status: string; key_actives: string[] };
export type VersionStep = { position: number; step_type: StepType; product_id: string | null; name: string | null };
export type VersionSteps = VersionStep[];
export type ConflictRule = { active_a: string; active_b: string; rule: 'never_same_routine' | 'never_same_day' | 'ask_first' };
export type ProposalState = {
  products: ProposalProduct[]; // active + paused (finished ones are never proposed)
  routines: { am: VersionSteps; pm: VersionSteps }; // the active versions
  reactions: { product_id: string | null; ingredient: string | null }[]; // resolved_at is null
  rules: ConflictRule[];
};
export type DiffStep = { step_type: StepType; product_name: string | null; position: number };
export type Proposal = { ok: true; period: 'am' | 'pm'; steps: VersionSteps; diff: { added: DiffStep[]; removed: DiffStep[]; moved: DiffStep[] } };
export type RejectionReason =
  | 'unknown_product' | 'ambiguous_product' | 'reaction' | 'one_new_active' | 'conflict' | 'needs_info'
  | 'sunscreen_pm' | 'nothing_to_remove' | 'no_change';
export type Rejection = { ok: false; reason: RejectionReason; needs_info?: string[] };

const reject = (reason: RejectionReason, needs_info?: string[]): Rejection => (needs_info ? { ok: false, reason, needs_info } : { ok: false, reason });
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
export const displayName = (p: { name: string; brand: string | null }) => [p.brand, p.name].filter(Boolean).join(' ');

// Exact name, else exact "brand name", else a unique substring match either way.
export function resolveProductName(name: string, products: readonly ProposalProduct[]): ProposalProduct | 'none' | 'ambiguous' {
  const q = norm(name);
  if (!q) return 'none';
  const pick = (hits: ProposalProduct[]) => (hits.length === 1 ? hits[0] : hits.length > 1 ? 'ambiguous' : null);
  return (
    pick(products.filter((p) => norm(p.name) === q)) ??
    pick(products.filter((p) => norm(displayName(p)) === q)) ??
    pick(products.filter((p) => { const d = norm(displayName(p)); return d.includes(q) || q.includes(norm(p.name)); })) ??
    'none'
  );
}

const renumber = (steps: VersionSteps): VersionSteps => steps.map((s, i) => ({ ...s, position: i + 1 }));
const sortSteps = (steps: VersionSteps): VersionSteps =>
  renumber([...steps].sort((a, b) => STEP_TYPES.indexOf(a.step_type) - STEP_TYPES.indexOf(b.step_type)));
const keyOf = (s: VersionStep) => `${s.step_type}:${s.product_id ?? ''}`;
const sameSteps = (a: VersionSteps, b: VersionSteps) => a.length === b.length && a.every((s, i) => keyOf(s) === keyOf(b[i]));
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildProposal(intent: ProposalIntent, state: ProposalState): Proposal | Rejection {
  const { period } = intent;
  const products = state.products.filter((p) => p.status !== 'finished');
  const byId = new Map(products.map((p) => [p.id, p]));
  // The diff baseline is the active version in its stored order; building always re-sorts canonically.
  const current = renumber([...state.routines[period]].sort((a, b) => a.position - b.position));
  const other = state.routines[period === 'am' ? 'pm' : 'am'];
  const productsOf = (steps: VersionSteps) => steps.flatMap((s) => (s.product_id && byId.get(s.product_id)) || []);
  const reacted = (p: ProposalProduct) =>
    state.reactions.some((r) => r.product_id === p.id || (r.ingredient && p.key_actives.some((a) => (INGREDIENT_ACTIVES[r.ingredient!] as readonly string[] | undefined ?? []).includes(a))));

  let steps: VersionSteps;
  let added: ProposalProduct | null = null;
  switch (intent.kind) {
    case 'add': {
      if (!intent.product_name) return reject('unknown_product');
      const p = resolveProductName(intent.product_name, products);
      if (p === 'none') return reject('unknown_product');
      if (p === 'ambiguous') return reject('ambiguous_product');
      if (reacted(p)) return reject('reaction');
      const step_type = intent.step_type ?? CATEGORY_STEP[p.category];
      if (step_type === 'protect' && period === 'pm') return reject('sunscreen_pm');
      if (current.some((s) => s.product_id === p.id)) return reject('no_change');
      added = p;
      steps = sortSteps([...current, { position: 0, step_type, product_id: p.id, name: null }]);
      break;
    }
    case 'remove': {
      let keep: VersionSteps;
      if (intent.product_name) {
        const p = resolveProductName(intent.product_name, products);
        if (typeof p === 'string') return reject('nothing_to_remove');
        keep = current.filter((s) => s.product_id !== p.id);
      } else if (intent.step_type) {
        keep = current.filter((s) => s.step_type !== intent.step_type);
      } else return reject('nothing_to_remove');
      if (keep.length === current.length) return reject('nothing_to_remove');
      steps = renumber(keep);
      break;
    }
    case 'reorder':
      steps = sortSteps(current);
      if (sameSteps(steps, current)) return reject('no_change');
      break;
    case 'simplify': {
      const middle = current.find((s) => s.step_type === 'serum' || s.step_type === 'treat');
      steps = renumber(current.filter((s) => ['cleanse', 'moisturize', 'protect'].includes(s.step_type) || s === middle));
      if (sameSteps(steps, current)) return reject('no_change');
      break;
    }
  }

  // Products the user reacted to never stay in a proposed version.
  steps = renumber(steps.filter((s) => { const p = s.product_id ? byId.get(s.product_id) : null; return !p || !reacted(p); }));

  const introduced = activesOf(productsOf([...steps, ...other])).filter((a) => !activesOf(productsOf([...current, ...other])).includes(a));
  if (introduced.length > 1) return reject('one_new_active');

  if (added) {
    const rules = new Map(state.rules.map((r) => [pairKey(r.active_a, r.active_b), r.rule]));
    const askFirst: string[] = [];
    const check = (others: ProposalProduct[], sameRoutine: boolean) => {
      for (const o of others) {
        if (o.id === added!.id) continue;
        for (const a of added!.key_actives) for (const b of o.key_actives) {
          const rule = rules.get(pairKey(a, b));
          if (rule === 'never_same_day' || (rule === 'never_same_routine' && sameRoutine)) return 'conflict';
          if (rule === 'ask_first') askFirst.push(displayName(o));
        }
      }
      return null;
    };
    if (check(productsOf(steps), true) || check(productsOf(other), false)) return reject('conflict');
    if (askFirst.length) return reject('needs_info', [...new Set(askFirst)]);

    // A product whose actives are unknown is never combined with a newly introduced active: ask first.
    const unknownOthers = productsOf(steps).filter((p) => p.id !== added!.id && p.key_actives.includes('unknown'));
    if (introduced.length === 1 && unknownOthers.length) return reject('needs_info', unknownOthers.map(displayName));
    if (added.key_actives.includes('unknown') && activesOf(productsOf(current)).length) return reject('needs_info', [displayName(added)]);
  }

  const diffStep = (s: VersionStep): DiffStep => ({ step_type: s.step_type, product_name: s.product_id ? displayName(byId.get(s.product_id)!) : null, position: s.position });
  const before = new Map(current.map((s) => [keyOf(s), s]));
  const after = new Map(steps.map((s) => [keyOf(s), s]));
  return {
    ok: true,
    period,
    steps,
    diff: {
      added: steps.filter((s) => !before.has(keyOf(s))).map(diffStep),
      removed: current.filter((s) => !after.has(keyOf(s))).map(diffStep),
      moved: steps.filter((s) => before.has(keyOf(s)) && before.get(keyOf(s))!.position !== s.position).map(diffStep),
    },
  };
}
