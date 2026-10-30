import { applyDiff, type Step } from '../diff';

const current: Step[] = [
  { step_type: 'moisturize', product_name: 'Cream', position: 2 },
  { step_type: 'cleanse', product_name: null, position: 1 },
];
const none = { added: [], removed: [], moved: [] };

describe('applyDiff', () => {
  it('returns the current steps sorted as "before" and unchanged as "after" for an empty diff', () => {
    const r = applyDiff(current, none);
    expect(r.before.map((s) => s.step_type)).toEqual(['cleanse', 'moisturize']);
    expect(r.after).toEqual(r.before);
  });

  it('inserts an added step at its position and moves the shifted ones', () => {
    const r = applyDiff(current, { ...none, added: [{ step_type: 'serum', product_name: 'Acme Hydra Serum', position: 2 }], moved: [{ step_type: 'moisturize', product_name: 'Cream', position: 3 }] });
    expect(r.after.map((s) => [s.step_type, s.position])).toEqual([['cleanse', 1], ['serum', 2], ['moisturize', 3]]);
    expect(r.before).toHaveLength(2);
  });

  it('drops a removed step and renumbers nothing it was not told to', () => {
    const r = applyDiff(current, { ...none, removed: [{ step_type: 'moisturize', product_name: 'Cream', position: 2 }] });
    expect(r.after).toEqual([{ step_type: 'cleanse', product_name: null, position: 1 }]);
  });

  it('applies a reorder through "moved" positions', () => {
    const r = applyDiff(current, { ...none, moved: [{ step_type: 'cleanse', product_name: null, position: 2 }, { step_type: 'moisturize', product_name: 'Cream', position: 1 }] });
    expect(r.after.map((s) => s.step_type)).toEqual(['moisturize', 'cleanse']);
  });
});
