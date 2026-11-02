/** @jest-environment node */
import { ACTIONS_FOR_BLOCK, ActionSchema, BlockSchema, parseBlocks } from '../chat/blocks';

const UUID = '11111111-1111-4111-8111-111111111111';
const quick = { type: 'quick_replies', id: 'b1', options: [{ id: 'o1', label: 'Show my routine' }] };

describe('BlockSchema', () => {
  it('accepts every stored block type', () => {
    const ok = [
      quick,
      { type: 'choice', id: 'b2', question: 'Which?', options: [{ id: 'o1', label: 'A' }, { id: 'o2', label: 'B' }] },
      { type: 'product_card', id: 'b3', mode: 'owned', product_id: UUID, name: 'Serum', brand: null, category: 'serum' },
      { type: 'routine_proposal', id: 'b4', candidate_routine_id: UUID, period: 'pm', diff: { added: [{ step_type: 'serum', product_name: 'Serum', position: 2 }], removed: [], moved: [] }, reason: 'r' },
      { type: 'confirm_change', id: 'b5', entity: 'skin_profile', row_id: null, field: 'budget', new_value: 'mid', label: 'Budget → mid', reason: 'r' },
      { type: 'scan_summary', id: 'b6', scan_id: UUID, date: '2026-10-28', metrics: [{ label: 'pore visibility', value: 70, trend: 'up' }] },
      { type: 'routine_card', id: 'b7', routines: [{ period: 'pm', steps: [{ step_type: 'cleanse', product_name: null }, { step_type: 'moisturize', product_name: 'Cream' }] }] },
    ];
    for (const b of ok) expect(BlockSchema.safeParse(b).success).toBe(true);
  });

  it('rejects unknown types, too many options, a missing mode and bad ids', () => {
    expect(BlockSchema.safeParse({ type: 'carousel', id: 'b1' }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...quick, options: Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, label: 'x' })) }).success).toBe(false);
    expect(BlockSchema.safeParse({ type: 'product_card', id: 'b3', product_id: null, name: 'S', brand: null, category: null }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...quick, id: 'block-1' }).success).toBe(false);
    expect(BlockSchema.safeParse({ type: 'product_card', id: 'b3', mode: 'owned', product_id: 'not-a-uuid', name: 'S', brand: null, category: null }).success).toBe(false);
  });

  it('parseBlocks keeps the valid entries and drops the rest', () => {
    expect(parseBlocks([quick, { type: 'nope' }, 42]).map((b) => b.id)).toEqual(['b1']);
    expect(parseBlocks('[]')).toEqual([]);
  });
});

describe('ActionSchema', () => {
  it('validates product input codes', () => {
    expect(ActionSchema.safeParse({ type: 'add_product', product: { name: 'Toner', category: 'toner', key_actives: ['bogus'] } }).success).toBe(false);
    const r = ActionSchema.safeParse({ type: 'add_product', product: { name: ' Toner ', category: 'toner' } });
    expect(r.success && r.data.type === 'add_product' && r.data.product).toEqual({ name: 'Toner', category: 'toner', use_time: 'both', key_actives: [] });
    expect(ActionSchema.safeParse({ type: 'send_text' }).success).toBe(false);
  });

  it('maps block types to their actions', () => {
    expect(ACTIONS_FOR_BLOCK.routine_proposal).toEqual(['accept_routine', 'decline_routine']);
    expect(ACTIONS_FOR_BLOCK.quick_replies).toEqual([]);
    expect(ACTIONS_FOR_BLOCK.routine_card).toEqual([]);
  });
});
