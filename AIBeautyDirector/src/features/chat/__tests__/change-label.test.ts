import { createInstance, type TFunction } from 'i18next';
import en from '@/lib/i18n/en.json';
import zhTW from '@/lib/i18n/zh-TW.json';
import { changeLabel, type ChangeBlock } from '../change-label';

const P1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const names: Record<string, string> = { [P1]: 'Acme Hydra Serum' };
const productName = (id: string) => names[id];

async function tFor(lng: 'en' | 'zh-TW'): Promise<TFunction> {
  const i = createInstance();
  await i.init({ lng, resources: { en: { translation: en }, 'zh-TW': { translation: zhTW } }, interpolation: { escapeValue: false } });
  return i.t;
}
const block = (over: Partial<ChangeBlock>): ChangeBlock => ({ entity: 'skin_profile', field: 'budget', row_id: null, new_value: 'low', label: 'SERVER LABEL', ...over });

// Every entity.field the chat function accepts (CHANGE_FIELDS in supabase/functions/chat/handler.ts).
const ALLOWED: ChangeBlock[] = [
  block({ field: 'goals', new_value: ['hydration', 'calm_redness'] }),
  block({ field: 'routine_level', new_value: 'beginner' }),
  block({ field: 'budget', new_value: 'low' }),
  block({ field: 'textures', new_value: ['gel'] }),
  block({ entity: 'product', field: 'status', row_id: P1, new_value: 'paused' }),
  block({ entity: 'product', field: 'use_time', row_id: P1, new_value: 'pm' }),
  block({ entity: 'product', field: 'key_actives', row_id: P1, new_value: ['niacinamide', 'hyaluronic_acid'] }),
  block({ entity: 'product', field: 'opened_at', row_id: P1, new_value: '2026-10-01' }),
  block({ entity: 'reaction', field: 'new', new_value: { product_id: P1, ingredient: null, reaction: 'stinging', severity: 'mild' } }),
  block({ entity: 'reaction', field: 'new', new_value: { product_id: null, ingredient: 'fragrance', reaction: 'redness', severity: 'moderate' } }),
  block({ entity: 'reaction', field: 'resolved_at', row_id: 'cccccccc-0000-4000-8000-000000000001', new_value: null }),
];

describe('changeLabel', () => {
  it('writes every allowed change in words, in both languages, never the server label or a raw code', async () => {
    for (const lng of ['en', 'zh-TW'] as const) {
      const t = await tFor(lng);
      for (const b of ALLOWED) {
        const s = changeLabel(b, t, productName);
        expect(s).not.toBe('SERVER LABEL');
        expect(s).not.toMatch(/_|\{|\}|chat\.blocks|codes\./);
      }
    }
  });

  it('reads naturally in each language', async () => {
    const [enT, zhT] = await Promise.all([tFor('en'), tFor('zh-TW')]);
    expect(changeLabel(ALLOWED[2], enT, productName)).toBe(`Budget: ${en.codes.budget.low}`);
    expect(changeLabel(ALLOWED[2], zhT, productName)).toBe(`預算：${zhTW.codes.budget.low}`);
    expect(changeLabel(ALLOWED[0], zhT, productName)).toBe(`目標：${zhTW.codes.goal.hydration}、${zhTW.codes.goal.calm_redness}`);
    expect(changeLabel(ALLOWED[8], zhT, productName)).toContain('Acme Hydra Serum');
    expect(changeLabel(ALLOWED[8], zhT, productName)).toContain(zhTW.codes.reaction.stinging);
    expect(changeLabel(ALLOWED[9], enT, productName)).toContain(en.codes.ingredient.fragrance);
  });

  it('falls back to the server label for anything it does not recognise', async () => {
    const t = await tFor('zh-TW');
    expect(changeLabel(block({ field: 'nickname' }), t, productName)).toBe('SERVER LABEL');
    expect(changeLabel(block({ field: 'budget', new_value: 'unlimited' }), t, productName)).toBe('SERVER LABEL');
    expect(changeLabel(block({ entity: 'product', field: 'status', row_id: 'unknown-id', new_value: 'paused' }), t, productName)).toBe('SERVER LABEL');
    expect(changeLabel(block({ entity: 'reaction', field: 'new', new_value: { reaction: 'stinging', severity: 'mild' } }), t, productName)).toBe('SERVER LABEL');
  });

  it('keeps a free-text ingredient as the user typed it', async () => {
    const t = await tFor('en');
    expect(changeLabel(block({ entity: 'reaction', field: 'new', new_value: { product_id: null, ingredient: 'witch hazel', reaction: 'dryness', severity: 'mild' } }), t, productName)).toContain('witch hazel');
  });
});
