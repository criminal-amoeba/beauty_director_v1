/** @jest-environment node */
import { STEP_TYPES, type StepType } from '../rules/actives';
import { buildProposal, resolveProductName, type ProposalIntent, type ProposalProduct, type ProposalState, type VersionSteps } from '../rules/proposal';

const product = (id: string, name: string, category: ProposalProduct['category'], key_actives: string[] = [], brand: string | null = null, status = 'active'): ProposalProduct =>
  ({ id, name, brand, category, status, key_actives });

const P = {
  cleanser: product('c', 'Cleanser', 'cleanser'),
  moisturizer: product('m', 'Cream', 'moisturizer'),
  spf: product('s', 'SPF 50', 'sunscreen'),
  retinol: product('r', 'Retinol Serum', 'serum', ['retinoid'], 'Acme'),
  aha: product('a', 'AHA Toner', 'toner', ['aha']),
  ahabha: product('ab', 'Peel Pads', 'treatment', ['aha', 'bha']),
  hydrating: product('h', 'Hydrating Serum', 'serum', ['hyaluronic_acid']),
  mystery: product('x', 'Mystery Cream', 'moisturizer', ['unknown']),
  serumA: product('sa', 'Serum A', 'serum'),
  serumB: product('sb', 'Serum B', 'serum'),
  finished: product('f', 'Old Serum', 'serum', [], null, 'finished'),
};
const steps = (...items: [string, string | null][]): VersionSteps =>
  items.map(([step_type, product_id], i) => ({ position: i + 1, step_type: step_type as VersionSteps[number]['step_type'], product_id, name: null }));

const base: ProposalState = {
  products: Object.values(P),
  routines: { am: steps(['cleanse', 'c'], ['moisturize', 'm'], ['protect', 's']), pm: steps(['cleanse', 'c'], ['moisturize', 'm']) },
  reactions: [],
  rules: [],
};
// A wanted routine: a product name, or a step type for a step without a product.
const want = (period: 'am' | 'pm', ...items: string[]): ProposalIntent => ({
  period,
  reason: 'r',
  steps: items.map((x) => ((STEP_TYPES as readonly string[]).includes(x) ? { step_type: x as StepType, product_name: null } : { step_type: 'other', product_name: x })),
});
// The state's current routine with one product added (resolved against the state the test builds with).
type Wanted = ProposalIntent | ((state: ProposalState) => ProposalIntent);
const add = (product_name: string, period: 'am' | 'pm' = 'pm'): Wanted => (state) =>
  want(period, ...state.routines[period].map((s) => state.products.find((p) => p.id === s.product_id)?.name ?? s.step_type), product_name);
const build = (w: Wanted, state: ProposalState) => buildProposal(typeof w === 'function' ? w(state) : w, state);
const reason = (r: ReturnType<typeof buildProposal>) => (r.ok ? 'ok' : r.reason);

describe('resolveProductName', () => {
  it('matches exact name, brand+name, or a unique substring; else none / ambiguous', () => {
    expect(resolveProductName('retinol serum', base.products)).toBe(P.retinol);
    expect(resolveProductName('Acme Retinol Serum', base.products)).toBe(P.retinol);
    expect(resolveProductName('retinol', base.products)).toBe(P.retinol);
    expect(resolveProductName('serum', base.products)).toBe('ambiguous');
    expect(resolveProductName('Serum A', base.products)).toBe(P.serumA);
    expect(resolveProductName('unicorn', base.products)).toBe('none');
    expect(resolveProductName('  ', base.products)).toBe('none');
  });
});

describe('buildProposal: add', () => {
  it('adds one product in canonical order with a diff', () => {
    const r = build(add('Retinol Serum'), base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.map((s) => s.step_type)).toEqual(['cleanse', 'serum', 'moisturize']);
    expect(r.steps.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(r.diff.added).toEqual([{ step_type: 'serum', product_name: 'Acme Retinol Serum', position: 2 }]);
    expect(r.diff.removed).toEqual([]);
    expect(r.diff.moved).toEqual([{ step_type: 'moisturize', product_name: 'Cream', position: 3 }]);
  });

  it('rejects unknown, ambiguous and finished products', () => {
    expect(reason(build(add('unicorn'), base))).toBe('unknown_product');
    expect(reason(build(add('Serum'), base))).toBe('ambiguous_product'); // capitalised: a lower-case step name is a product-less step
    expect(reason(build(add('Old Serum'), base))).toBe('unknown_product');
  });

  it('rejects a product with two new actives', () => {
    expect(reason(build(add('Peel Pads'), base))).toBe('one_new_active');
  });

  it('counts actives across AM and PM: a second new active anywhere is rejected', () => {
    const state = { ...base, routines: { ...base.routines, am: steps(['cleanse', 'c'], ['tone', 'a'], ['moisturize', 'm'], ['protect', 's']) } };
    // aha already in AM → adding retinol to PM introduces only retinoid → ok
    expect(reason(build(add('Retinol Serum'), state))).toBe('ok');
    // nothing in either → adding Peel Pads (aha+bha) → two new
    expect(reason(build(add('Peel Pads'), base))).toBe('one_new_active');
  });

  it('excludes products with an active reaction (by product or by ingredient)', () => {
    expect(reason(build(add('Retinol Serum'), { ...base, reactions: [{ product_id: 'r', ingredient: null }] }))).toBe('reaction');
    expect(reason(build(add('AHA Toner'), { ...base, reactions: [{ product_id: null, ingredient: 'exfoliating_acids' }] }))).toBe('reaction');
    expect(reason(build(add('Retinol Serum'), { ...base, reactions: [{ product_id: null, ingredient: 'fragrance' }] }))).toBe('ok');
  });

  it('never puts sunscreen in the PM routine, as a product or a bare step', () => {
    expect(reason(build(add('SPF 50', 'pm'), { ...base, routines: { ...base.routines, am: steps(['cleanse', 'c']) } }))).toBe('sunscreen_pm');
    expect(reason(build(want('pm', 'Cleanser', 'Cream', 'protect'), base))).toBe('sunscreen_pm');
  });

  it('applies conflict rules from the table and none when it is empty', () => {
    const withAha = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['tone', 'a'], ['moisturize', 'm']) } };
    expect(reason(build(add('Retinol Serum'), withAha))).toBe('ok');
    const sameRoutine = { ...withAha, rules: [{ active_a: 'aha', active_b: 'retinoid', rule: 'never_same_routine' as const }] };
    expect(reason(build(add('Retinol Serum'), sameRoutine))).toBe('conflict');
    const ahaInAm = { ...base, routines: { ...base.routines, am: steps(['cleanse', 'c'], ['tone', 'a'], ['protect', 's']) }, rules: sameRoutine.rules };
    expect(reason(build(add('Retinol Serum'), ahaInAm))).toBe('ok'); // different routine
    const sameDay = { ...ahaInAm, rules: [{ active_a: 'aha', active_b: 'retinoid', rule: 'never_same_day' as const }] };
    expect(reason(build(add('Retinol Serum'), sameDay))).toBe('conflict');
    const ask = build(add('Retinol Serum'), { ...withAha, rules: [{ active_a: 'aha', active_b: 'retinoid', rule: 'ask_first' }] });
    expect(ask).toEqual({ ok: false, reason: 'needs_info', needs_info: ['AHA Toner'] });
  });

  it('asks first before combining a new active with an unknown-actives product, but allows inert ones', () => {
    const withMystery = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['moisturize', 'x']) } };
    expect(build(add('Retinol Serum'), withMystery)).toEqual({ ok: false, reason: 'needs_info', needs_info: ['Mystery Cream'] });
    expect(reason(build(add('Hydrating Serum'), withMystery))).toBe('ok');
    const withRetinol = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['serum', 'r']) } };
    expect(build(want('pm', 'Cleanser', 'Retinol Serum', 'Mystery Cream'), withRetinol)).toEqual({ ok: false, reason: 'needs_info', needs_info: ['Mystery Cream'] });
  });

  it('rejects a list equal to the current routine; a product listed twice counts once', () => {
    expect(reason(build(add('Cream'), base))).toBe('no_change');
    expect(reason(build(want('pm', 'Cleanser', 'Cream'), base))).toBe('no_change');
  });

  it('sorts the list canonically and takes the step type from the product category', () => {
    const r = build({ period: 'pm', reason: 'r', steps: [{ step_type: 'cleanse', product_name: 'Cream' }, { step_type: 'mask', product_name: 'Retinol Serum' }, { step_type: 'serum', product_name: 'Cleanser' }] }, base);
    expect(r.ok && r.steps.map((s) => [s.step_type, s.product_id])).toEqual([['cleanse', 'c'], ['serum', 'r'], ['moisturize', 'm']]);
  });

  it('adds two products at once when together they bring at most one new active', () => {
    const r = build(want('pm', 'Cleanser', 'Hydrating Serum', 'Retinol Serum', 'Cream'), base);
    expect(r.ok && r.diff.added.map((d) => d.product_name)).toEqual(['Hydrating Serum', 'Acme Retinol Serum']);
    expect(reason(build(want('pm', 'Cleanser', 'AHA Toner', 'Retinol Serum', 'Cream'), base))).toBe('one_new_active');
  });
});

describe('buildProposal: remove / reorder / simplify as a step list', () => {
  it('removes a step by leaving it out; an empty list is rejected', () => {
    const r = build(want('am', 'Cleanser', 'Cream'), base);
    expect(r.ok && r.steps.map((s) => s.step_type)).toEqual(['cleanse', 'moisturize']);
    expect(r.ok && r.diff.removed).toEqual([{ step_type: 'protect', product_name: 'SPF 50', position: 3 }]);
    expect(reason(build({ period: 'pm', steps: [], reason: 'r' }, base))).toBe('empty');
  });

  it('a messy routine listed again comes back in canonical order', () => {
    const messy = { ...base, routines: { ...base.routines, pm: steps(['moisturize', 'm'], ['cleanse', 'c']) } };
    const r = build(want('pm', 'Cream', 'Cleanser'), messy);
    expect(r.ok && r.steps.map((s) => s.step_type)).toEqual(['cleanse', 'moisturize']);
    expect(r.ok && r.diff.moved.map((d) => d.step_type)).toEqual(['cleanse', 'moisturize']);
  });

  it('simplifies a busy PM routine to two steps', () => {
    const busy = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['tone', 'a'], ['serum', 'h'], ['treat', 'r'], ['moisturize', 'm'], ['mask', null]) } };
    const r = build(want('pm', 'Cleanser', 'Cream'), busy);
    expect(r.ok && r.steps.map((s) => s.product_id)).toEqual(['c', 'm']);
    expect(r.ok && r.diff.removed.map((d) => d.step_type)).toEqual(['tone', 'serum', 'treat', 'mask']);
  });

  it('keeps the name of a product-less step that stays', () => {
    const named = { ...base, routines: { ...base.routines, pm: [{ position: 1, step_type: 'cleanse' as const, product_id: null, name: 'Micellar water' }, { position: 2, step_type: 'moisturize' as const, product_id: 'm', name: null }] } };
    const r = build(want('pm', 'cleanse', 'Hydrating Serum', 'Cream'), named);
    expect(r.ok && r.steps[0]).toEqual({ position: 1, step_type: 'cleanse', product_id: null, name: 'Micellar water' });
    expect(r.ok && r.diff.added.map((d) => d.product_name)).toEqual(['Hydrating Serum']);
  });

  it('drops reacted products that are already in the routine', () => {
    const state = { ...base, routines: { ...base.routines, pm: steps(['moisturize', 'm'], ['cleanse', 'c'], ['tone', 'a']) }, reactions: [{ product_id: 'a', ingredient: null }] };
    const r = build(want('pm', 'Cleanser', 'AHA Toner', 'Cream'), state);
    expect(r.ok && r.steps.map((s) => s.product_id)).toEqual(['c', 'm']);
  });
});
