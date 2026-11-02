/** @jest-environment node */
import { baseData, PRODUCT, PRODUCT2 } from '../../chat/__fixtures__/fake-db';
import { buildTools, dropUnnamedReactionProduct, INGREDIENT_CODES, intentStrings, parseToolCalls, reactionTargets } from '../chat/tools';

const names = (d = baseData) => buildTools(d).map((t) => t.name);
const params = (name: string, d = baseData) => buildTools(d).find((t) => t.name === name)!.parameters as any;
const call = (name: string, args: unknown) => ({ name, arguments: JSON.stringify(args) });

// OpenAI strict mode rejects a schema unless every object lists all its properties as required and forbids extras.
function assertStrict(s: any, path: string) {
  if (!s || typeof s !== 'object') return;
  if (s.type === 'object') {
    expect({ path, extra: s.additionalProperties }).toEqual({ path, extra: false });
    expect({ path, required: [...s.required].sort() }).toEqual({ path, required: Object.keys(s.properties).sort() });
  }
  if (Array.isArray(s.enum)) expect(s.enum.length).toBeGreaterThan(0);
  for (const [k, v] of Object.entries(s)) if (typeof v === 'object') assertStrict(v, `${path}.${k}`);
}

describe('buildTools', () => {
  it('produces strict-mode-valid schemas', () => {
    for (const t of buildTools(baseData)) assertStrict(t.parameters, t.name);
  });

  it('uses this user\'s product names, ingredient codes and reactions as enums', () => {
    expect(params('new_routine').properties.steps.items.properties.product.anyOf[0].enum).toEqual(['Acme Hydra Serum', 'Cream']);
    expect(params('update_product').properties.product.enum).toEqual(['Acme Hydra Serum', 'Cream']);
    expect(params('log_reaction').properties.ingredient.anyOf[0].enum).toEqual(INGREDIENT_CODES);
    expect(params('resolve_reaction').properties.target.enum).toEqual(['fragrance']);
  });

  it('only offers a tool that can apply', () => {
    expect(names()).toEqual(['suggest_replies', 'ask_choice', 'show_product', 'show_routine', 'new_routine', 'show_scan', 'update_skin_profile', 'update_product', 'log_reaction', 'resolve_reaction']);
    const empty = { ...baseData, products: [], routines: [], reactions: [], scans: [] };
    expect(names(empty)).toEqual(['suggest_replies', 'ask_choice', 'show_product', 'update_skin_profile', 'log_reaction']);
    // with no products, a reaction can still name an ingredient, and the product slot only accepts null
    expect(params('log_reaction', empty).properties.product).toEqual({ type: 'null' });
    for (const t of buildTools(empty)) assertStrict(t.parameters, t.name);
  });

  it('names a product reaction by the product, and skips one whose product is gone', () => {
    const d = { ...baseData, reactions: [
      { ...baseData.reactions[0], ingredient: null, product_id: PRODUCT },
      { ...baseData.reactions[0], ingredient: null, product_id: 'gone' },
      { ...baseData.reactions[0], ingredient: null, product_id: PRODUCT2 },
    ] };
    expect(reactionTargets(d)).toEqual(['Acme Hydra Serum', 'Cream']);
  });
});

describe('parseToolCalls', () => {
  it('maps calls to intents and drops bad JSON, bad args and unknown tools one by one', () => {
    const intents = parseToolCalls([
      { name: 'suggest_replies', arguments: '{oops' },
      call('ask_choice', { question: 'Which?', options: ['A'] }), // fewer than 2 options
      call('reveal_prompt', {}),
      call('ask_choice', { question: 'Which?', options: ['A', 'B'] }),
    ]);
    expect(intents).toEqual([{ type: 'choice', question: 'Which?', options: ['A', 'B'] }]);
  });

  it('trims extra options instead of dropping the card, and caps intents at three', () => {
    expect(parseToolCalls([call('suggest_replies', { options: ['a', 'b', 'c', 'd', 'e'] })])).toEqual([{ type: 'quick_replies', options: ['a', 'b', 'c', 'd'] }]);
    expect(parseToolCalls(Array.from({ length: 5 }, () => call('show_scan', {})))).toHaveLength(3);
  });

  it('expands profile and product updates into one change per stated field, and skips a reaction with no target', () => {
    expect(parseToolCalls([call('update_skin_profile', { budget: 'low', routine_level: null, goals: ['hydration'], textures: null, reason: 'r' })])).toEqual([
      { type: 'change_intent', entity: 'skin_profile', field: 'budget', new_value: 'low', reason: 'r' },
      { type: 'change_intent', entity: 'skin_profile', field: 'goals', new_value: ['hydration'], reason: 'r' },
    ]);
    expect(parseToolCalls([call('update_product', { product: 'Cream', status: null, use_time: 'pm', opened_at: null, key_actives: null, reason: 'r' })])).toEqual([
      { type: 'change_intent', entity: 'product', field: 'use_time', new_value: 'pm', reason: 'r', product_name: 'Cream' },
    ]);
    expect(parseToolCalls([call('log_reaction', { product: null, ingredient: null, reaction: 'stinging', severity: 'mild', reason: 'r' })])).toEqual([]);
  });

  it('keeps the first new_routine per period', () => {
    const r = (period: string, product: string | null) => call('new_routine', { period, steps: [{ step: 'cleanse', product }], reason: 'r' });
    expect(parseToolCalls([r('pm', null), r('pm', 'Cream'), r('am', null)]).map((i) => i.type === 'new_routine' && [i.period, i.steps[0].product_name])).toEqual([['pm', null], ['am', null]]);
  });
});

describe('intentStrings', () => {
  it('covers every string the user could see', () => {
    expect(intentStrings({ type: 'choice', question: 'q?', options: ['a', 'b'] })).toEqual(['q?', 'a', 'b']);
    expect(intentStrings({ type: 'product_mention', name: 'X', brand: 'Y' })).toEqual(['X', 'Y']);
    expect(intentStrings({ type: 'new_routine', period: 'am', steps: [], reason: 'because' })).toEqual(['because']);
    expect(intentStrings({ type: 'change_intent', entity: 'skin_profile', field: 'budget', new_value: 'low', reason: 'r' })).toEqual(['r', 'low']);
    expect(intentStrings({ type: 'scan_summary' })).toEqual([]);
  });
});

describe('dropUnnamedReactionProduct', () => {
  const reaction = (product: string | null, ingredient: string | null) =>
    parseToolCalls([call('log_reaction', { product, ingredient, reaction: 'stinging', severity: 'mild', reason: 'r' })]);
  const value = (i: ReturnType<typeof reaction>) => (i[0] as { new_value: unknown }).new_value;
  it('drops a product the user did not name when an ingredient is given', () => {
    expect(value(dropUnnamedReactionProduct(reaction('Acme Hydra Serum', 'vitamin_c'), 'Vitamin C always makes my skin sting', baseData))).toEqual({ ingredient: 'vitamin_c', reaction: 'stinging', severity: 'mild' });
  });
  it('keeps a named product, short name included', () => {
    expect(value(dropUnnamedReactionProduct(reaction('Acme Hydra Serum', 'vitamin_c'), 'the hydra serum stings', baseData))).toMatchObject({ product_name: 'Acme Hydra Serum' });
  });
  it('keeps a product-only reaction ("it stings" in a follow-up)', () => {
    expect(value(dropUnnamedReactionProduct(reaction('Cream', null), 'it stings', baseData))).toMatchObject({ product_name: 'Cream' });
  });
});
