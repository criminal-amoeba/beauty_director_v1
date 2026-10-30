/** @jest-environment node */
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
const add = (product_name: string, period: 'am' | 'pm' = 'pm', extra: Partial<ProposalIntent> = {}): ProposalIntent => ({ kind: 'add', period, product_name, reason: 'r', ...extra });
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
    const r = buildProposal(add('Retinol Serum'), base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.steps.map((s) => s.step_type)).toEqual(['cleanse', 'serum', 'moisturize']);
    expect(r.steps.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(r.diff.added).toEqual([{ step_type: 'serum', product_name: 'Acme Retinol Serum', position: 2 }]);
    expect(r.diff.removed).toEqual([]);
    expect(r.diff.moved).toEqual([{ step_type: 'moisturize', product_name: 'Cream', position: 3 }]);
  });

  it('rejects unknown, ambiguous and finished products', () => {
    expect(reason(buildProposal(add('unicorn'), base))).toBe('unknown_product');
    expect(reason(buildProposal(add('serum'), base))).toBe('ambiguous_product');
    expect(reason(buildProposal(add('Old Serum'), base))).toBe('unknown_product');
    expect(reason(buildProposal({ kind: 'add', period: 'pm', reason: 'r' }, base))).toBe('unknown_product');
  });

  it('rejects a product with two new actives', () => {
    expect(reason(buildProposal(add('Peel Pads'), base))).toBe('one_new_active');
  });

  it('counts actives across AM and PM: a second new active anywhere is rejected', () => {
    const state = { ...base, routines: { ...base.routines, am: steps(['cleanse', 'c'], ['tone', 'a'], ['moisturize', 'm'], ['protect', 's']) } };
    // aha already in AM → adding retinol to PM introduces only retinoid → ok
    expect(reason(buildProposal(add('Retinol Serum'), state))).toBe('ok');
    // nothing in either → adding Peel Pads (aha+bha) → two new
    expect(reason(buildProposal(add('Peel Pads'), base))).toBe('one_new_active');
  });

  it('excludes products with an active reaction (by product or by ingredient)', () => {
    expect(reason(buildProposal(add('Retinol Serum'), { ...base, reactions: [{ product_id: 'r', ingredient: null }] }))).toBe('reaction');
    expect(reason(buildProposal(add('AHA Toner'), { ...base, reactions: [{ product_id: null, ingredient: 'exfoliating_acids' }] }))).toBe('reaction');
    expect(reason(buildProposal(add('Retinol Serum'), { ...base, reactions: [{ product_id: null, ingredient: 'fragrance' }] }))).toBe('ok');
  });

  it('never puts sunscreen in the PM routine', () => {
    expect(reason(buildProposal(add('SPF 50', 'pm'), { ...base, routines: { ...base.routines, am: steps(['cleanse', 'c']) } }))).toBe('sunscreen_pm');
  });

  it('applies conflict rules from the table and none when it is empty', () => {
    const withAha = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['tone', 'a'], ['moisturize', 'm']) } };
    expect(reason(buildProposal(add('Retinol Serum'), withAha))).toBe('ok');
    const sameRoutine = { ...withAha, rules: [{ active_a: 'aha', active_b: 'retinoid', rule: 'never_same_routine' as const }] };
    expect(reason(buildProposal(add('Retinol Serum'), sameRoutine))).toBe('conflict');
    const ahaInAm = { ...base, routines: { ...base.routines, am: steps(['cleanse', 'c'], ['tone', 'a'], ['protect', 's']) }, rules: sameRoutine.rules };
    expect(reason(buildProposal(add('Retinol Serum'), ahaInAm))).toBe('ok'); // different routine
    const sameDay = { ...ahaInAm, rules: [{ active_a: 'aha', active_b: 'retinoid', rule: 'never_same_day' as const }] };
    expect(reason(buildProposal(add('Retinol Serum'), sameDay))).toBe('conflict');
    const ask = buildProposal(add('Retinol Serum'), { ...withAha, rules: [{ active_a: 'aha', active_b: 'retinoid', rule: 'ask_first' }] });
    expect(ask).toEqual({ ok: false, reason: 'needs_info', needs_info: ['AHA Toner'] });
  });

  it('asks first before combining a new active with an unknown-actives product, but allows inert ones', () => {
    const withMystery = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['moisturize', 'x']) } };
    expect(buildProposal(add('Retinol Serum'), withMystery)).toEqual({ ok: false, reason: 'needs_info', needs_info: ['Mystery Cream'] });
    expect(reason(buildProposal(add('Hydrating Serum'), withMystery))).toBe('ok');
    const withRetinol = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['serum', 'r']) } };
    expect(buildProposal(add('Mystery Cream'), withRetinol)).toEqual({ ok: false, reason: 'needs_info', needs_info: ['Mystery Cream'] });
  });

  it('rejects adding a product that is already in the routine', () => {
    expect(reason(buildProposal(add('Cream'), base))).toBe('no_change');
  });
});

describe('buildProposal: remove / reorder / simplify', () => {
  it('remove by product name or step type; nothing matching is rejected', () => {
    const r = buildProposal({ kind: 'remove', period: 'am', product_name: 'SPF 50', reason: 'r' }, base);
    expect(r.ok && r.steps.map((s) => s.step_type)).toEqual(['cleanse', 'moisturize']);
    expect(r.ok && r.diff.removed).toEqual([{ step_type: 'protect', product_name: 'SPF 50', position: 3 }]);
    expect(reason(buildProposal({ kind: 'remove', period: 'pm', step_type: 'tone', reason: 'r' }, base))).toBe('nothing_to_remove');
    expect(reason(buildProposal({ kind: 'remove', period: 'pm', reason: 'r' }, base))).toBe('nothing_to_remove');
  });

  it('reorder sorts by canonical order and rejects an already sorted routine', () => {
    expect(reason(buildProposal({ kind: 'reorder', period: 'am', reason: 'r' }, base))).toBe('no_change');
    const messy = { ...base, routines: { ...base.routines, pm: steps(['moisturize', 'm'], ['cleanse', 'c']) } };
    const r = buildProposal({ kind: 'reorder', period: 'pm', reason: 'r' }, messy);
    expect(r.ok && r.steps.map((s) => s.step_type)).toEqual(['cleanse', 'moisturize']);
    expect(r.ok && r.diff.moved.map((d) => d.step_type)).toEqual(['cleanse', 'moisturize']);
  });

  it('simplify keeps cleanse, moisturize, protect and the first serum/treat', () => {
    const busy = { ...base, routines: { ...base.routines, pm: steps(['cleanse', 'c'], ['tone', 'a'], ['serum', 'h'], ['treat', 'r'], ['moisturize', 'm'], ['mask', null]) } };
    const r = buildProposal({ kind: 'simplify', period: 'pm', reason: 'r' }, busy);
    expect(r.ok && r.steps.map((s) => s.step_type)).toEqual(['cleanse', 'serum', 'moisturize']);
    expect(reason(buildProposal({ kind: 'simplify', period: 'am', reason: 'r' }, base))).toBe('no_change');
  });

  it('drops reacted products from any proposed version', () => {
    const state = { ...base, routines: { ...base.routines, pm: steps(['moisturize', 'm'], ['cleanse', 'c'], ['tone', 'a']) }, reactions: [{ product_id: 'a', ingredient: null }] };
    const r = buildProposal({ kind: 'reorder', period: 'pm', reason: 'r' }, state);
    expect(r.ok && r.steps.map((s) => s.product_id)).toEqual(['c', 'm']);
  });
});
