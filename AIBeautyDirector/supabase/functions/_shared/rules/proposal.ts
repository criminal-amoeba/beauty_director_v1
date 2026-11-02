// Routine proposals (step 10 §D), pure. The LLM proposes a whole new AM or PM step list with product NAMES; this
// engine resolves names to the user's own products, applies the safety constraints in a fixed order and returns the
// steps of a candidate version plus a diff, or a rejection the chat function turns into "no block".
// Order: resolve products → reactions (newly added rejects, existing ones are dropped) → sunscreen AM-only → at most
// one new active (AM+PM together) → ingredient conflict rules (table, empty in V1) → unknown-actives products →
// canonical step order → no change → diff.
import { activesOf, CATEGORY_STEP, INGREDIENT_ACTIVES, STEP_TYPES, type Category, type StepType } from './actives.ts';

export type ProposalStepIn = { step_type: StepType; product_name: string | null };
export type ProposalIntent = { period: 'am' | 'pm'; steps: ProposalStepIn[]; reason: string };
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
  | 'sunscreen_pm' | 'empty' | 'no_change';
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

  // Requested steps → version steps. A product's own category decides its step type; a step without a product
  // reuses the name of a product-less step of that type already in the routine. A product listed twice counts once.
  const requested: VersionSteps = [];
  const spare = current.filter((s) => !s.product_id);
  for (const r of intent.steps) {
    if (r.product_name) {
      const p = resolveProductName(r.product_name, products);
      if (p === 'none') return reject('unknown_product');
      if (p === 'ambiguous') return reject('ambiguous_product');
      if (!requested.some((s) => s.product_id === p.id)) requested.push({ position: 0, step_type: CATEGORY_STEP[p.category], product_id: p.id, name: null });
    } else {
      const i = spare.findIndex((s) => s.step_type === r.step_type);
      requested.push({ position: 0, step_type: r.step_type, product_id: null, name: i >= 0 ? spare.splice(i, 1)[0].name : null });
    }
  }

  const inCurrent = new Set(current.map(keyOf));
  const added = requested.flatMap((s) => (s.product_id && !current.some((c) => c.product_id === s.product_id) ? [byId.get(s.product_id)!] : []));
  if (added.some(reacted)) return reject('reaction');
  if (period === 'pm' && requested.some((s) => s.step_type === 'protect' && !inCurrent.has(keyOf(s)))) return reject('sunscreen_pm');

  // Products the user reacted to never stay in a proposed version.
  const steps = sortSteps(requested.filter((s) => { const p = s.product_id ? byId.get(s.product_id) : null; return !p || !reacted(p); }));
  if (steps.length === 0) return reject('empty');
  if (sameSteps(steps, current)) return reject('no_change');

  const introduced = activesOf(productsOf([...steps, ...other])).filter((a) => !activesOf(productsOf([...current, ...other])).includes(a));
  if (introduced.length > 1) return reject('one_new_active');

  const rules = new Map(state.rules.map((r) => [pairKey(r.active_a, r.active_b), r.rule]));
  const addedIds = new Set(added.map((p) => p.id));
  const askFirst: string[] = [];
  for (const a of added) {
    const check = (others: ProposalProduct[], sameRoutine: boolean) => {
      for (const o of others) {
        if (o.id === a.id) continue;
        for (const x of a.key_actives) for (const y of o.key_actives) {
          const rule = rules.get(pairKey(x, y));
          if (rule === 'never_same_day' || (rule === 'never_same_routine' && sameRoutine)) return 'conflict';
          if (rule === 'ask_first') askFirst.push(displayName(o));
        }
      }
      return null;
    };
    if (check(productsOf(steps), true) || check(productsOf(other), false)) return reject('conflict');
  }
  if (askFirst.length) return reject('needs_info', [...new Set(askFirst)]);

  // A product whose actives are unknown is never combined with a newly introduced active: ask first.
  if (added.length) {
    const unknownOthers = productsOf(steps).filter((p) => !addedIds.has(p.id) && p.key_actives.includes('unknown'));
    if (introduced.length === 1 && unknownOthers.length) return reject('needs_info', unknownOthers.map(displayName));
    const unknownAdded = added.filter((p) => p.key_actives.includes('unknown'));
    if (unknownAdded.length && activesOf(productsOf(current)).length) return reject('needs_info', unknownAdded.map(displayName));
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
