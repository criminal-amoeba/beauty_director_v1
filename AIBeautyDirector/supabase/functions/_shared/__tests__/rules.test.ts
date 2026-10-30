/** @jest-environment node */
import { CORE_METRIC_CODES, type Metric, type MetricCode } from '../codes';
import { comparable } from '../rules/goals';
import { review, type ReviewInput } from '../rules/review';

const metric = (code: MetricCode, value: number): Metric => ({ metric_code: code, value, metric_definition_version: 'v1' });
const all = (value: number, overrides: Partial<Record<MetricCode, number>> = {}) =>
  CORE_METRIC_CODES.map((c) => metric(c, overrides[c] ?? value));

const base: ReviewInput = {
  metrics: all(80),
  previous: null,
  goals: [],
  budget: 'mid',
  reactions: [],
  ownedCategories: [],
  routineSteps: { am: ['cleanse', 'moisturize', 'protect'], pm: ['cleanse', 'moisturize'] },
};
const codes = (input: ReviewInput) => review(input).actions.map((a) => a.code);

describe('review: focus', () => {
  it('picks the two weakest metrics tied to the goals', () => {
    const r = review({ ...base, goals: ['calm_redness', 'pore_visibility', 'anti_aging'], metrics: all(80, { redness_appearance: 40, pore_visibility: 60, wrinkle_visibility: 90, breakout_visibility: 10 }) });
    expect(r.focus).toEqual(['redness_appearance', 'pore_visibility']); // breakouts are lower but not a goal
  });
  it('falls back to the weakest core metrics when goals map to nothing', () => {
    const r = review({ ...base, goals: ['unknown_goal'], metrics: all(80, { firmness_appearance: 30, oiliness_balance: 50 }) });
    expect(r.focus).toEqual(['firmness_appearance', 'oiliness_balance']);
  });
  it('maps hydration to texture (proxy) and dedupes shared metrics', () => {
    const r = review({ ...base, goals: ['hydration', 'texture'], metrics: all(80, { texture_smoothness: 55 }) });
    expect(r.focus).toEqual(['texture_smoothness']);
  });
});

describe('review: trends', () => {
  it('has no trend without a comparable previous scan', () => {
    expect(review(base).metrics.every((m) => m.trend === null)).toBe(true);
  });
  it('classifies deltas with the 5-point band', () => {
    const r = review({ ...base, previous: all(80, { pore_visibility: 70, redness_appearance: 90, texture_smoothness: 76 }) });
    const trend = (c: MetricCode) => r.metrics.find((m) => m.code === c)?.trend;
    expect(trend('pore_visibility')).toBe('up');
    expect(trend('redness_appearance')).toBe('down');
    expect(trend('texture_smoothness')).toBe('flat');
    expect(trend('firmness_appearance')).toBe('flat');
  });
  it('comparable() requires the same provider, model, protocol and definition versions', () => {
    const a = { provider: 'dermiq', provider_model_version: 'm1', capture_protocol_version: 'cp1', metric_definition_version: 'v1' };
    expect(comparable(a, { ...a })).toBe(true);
    expect(comparable(a, { ...a, provider_model_version: 'm2' })).toBe(false);
    expect(comparable(a, { ...a, provider: 'other' })).toBe(false);
    expect(comparable(a, { ...a, capture_protocol_version: 'cp2' })).toBe(false);
    expect(comparable(a, { ...a, metric_definition_version: 'v2' })).toBe(false);
  });
});

describe('review: actions', () => {
  it('a complete routine → max_one_new_active, no purchase, keep routine', () => {
    expect(codes(base)).toEqual(['max_one_new_active', 'no_purchase_needed', 'keep_routine']);
  });

  it('moderate and severe reactions become avoid actions first; mild ones do not', () => {
    const r = review({
      ...base,
      reactions: [
        { ingredient: 'fragrance', severity: 'moderate' },
        { ingredient: 'retinoids', severity: 'severe' },
        { ingredient: 'niacinamide', severity: 'mild' },
        { ingredient: null, severity: 'severe' },
        { ingredient: 'fragrance', severity: 'severe' },
      ],
    });
    expect(r.actions.slice(0, 2)).toEqual([
      { code: 'avoid_ingredient', ingredient: 'fragrance' },
      { code: 'avoid_ingredient', ingredient: 'retinoids' },
    ]);
    expect(r.actions.map((a) => a.code)).toContain('gentle_routine'); // a severe reaction keeps the week gentle
  });

  it('low redness or texture triggers gentle_routine', () => {
    expect(codes({ ...base, metrics: all(80, { redness_appearance: 49 }) })).toContain('gentle_routine');
    expect(codes({ ...base, metrics: all(80, { texture_smoothness: 49 }) })).toContain('gentle_routine');
    expect(codes({ ...base, metrics: all(80, { redness_appearance: 50 }) })).not.toContain('gentle_routine');
  });

  it('routine gaps: owned products mean no purchase; missing ones are suggested on a mid/high budget only', () => {
    const gaps = { ...base, routineSteps: { am: ['cleanse'], pm: ['cleanse'] } };
    expect(codes({ ...gaps, ownedCategories: ['sunscreen', 'moisturizer'] })).toEqual([
      'max_one_new_active', 'add_spf_am', 'add_moisturizer_pm', 'no_purchase_needed',
    ]);
    expect(review({ ...gaps, ownedCategories: ['sunscreen'], budget: 'high' }).actions).toEqual([
      { code: 'max_one_new_active' },
      { code: 'add_spf_am' },
      { code: 'add_moisturizer_pm' },
      { code: 'consider_product', category: 'moisturizer' },
    ]);
    expect(codes({ ...gaps, ownedCategories: [], budget: 'low' })).toEqual([
      'max_one_new_active', 'add_spf_am', 'add_moisturizer_pm', 'no_purchase_needed',
    ]);
    expect(codes({ ...gaps, ownedCategories: [], budget: null })).toContain('consider_product');
  });

  it('never emits keep_routine together with an add_* action, and never both purchase codes', () => {
    for (const steps of [{ am: [], pm: [] }, { am: ['protect'], pm: [] }, { am: [], pm: ['moisturize'] }, base.routineSteps]) {
      const c = codes({ ...base, routineSteps: steps, budget: 'high' });
      const adds = c.filter((x) => x === 'add_spf_am' || x === 'add_moisturizer_pm').length;
      if (adds > 0) expect(c).not.toContain('keep_routine');
      expect(c.includes('consider_product') && c.includes('no_purchase_needed')).toBe(false);
    }
  });

  it('is deterministic', () => {
    const input = { ...base, goals: ['oil_control'], reactions: [{ ingredient: 'alcohol', severity: 'moderate' as const }] };
    expect(review(input)).toEqual(review(input));
  });
});
