import { emptyProduct, isValidPastDate, productFormSchema, toFormInput, toInsert, type ProductRow } from '../schemas';

const today = new Date('2026-10-30T12:00:00Z');
const valid = { ...emptyProduct, name: 'Toner', category: 'toner' as const };

describe('isValidPastDate', () => {
  it('accepts real past dates from 2000 and rejects the rest', () => {
    expect(isValidPastDate('2026-10-30', today)).toBe(true);
    expect(isValidPastDate('2026-10-31', today)).toBe(false);
    expect(isValidPastDate('2026-13-01', today)).toBe(false);
    expect(isValidPastDate('2026-02-30', today)).toBe(false);
    expect(isValidPastDate('1999-12-31', today)).toBe(false);
    expect(isValidPastDate('26-1-1', today)).toBe(false);
  });
});

describe('productFormSchema', () => {
  const paths = (v: unknown) => { const r = productFormSchema.safeParse(v); return r.success ? [] : r.error.issues.map((i) => i.path.join('.')).sort(); };

  it('requires a name and a category; the rest is optional', () => {
    expect(paths(valid)).toEqual([]);
    expect(paths({ ...valid, name: ' ', category: null })).toEqual(['category', 'name']);
  });

  it('checks the opened date only when given', () => {
    expect(paths({ ...valid, opened_at: '' })).toEqual([]);
    expect(paths({ ...valid, opened_at: '2026-13-01' })).toEqual(['opened_at']);
  });

  it('limits actives to known codes and ingredients to 2000 chars', () => {
    expect(paths({ ...valid, key_actives: ['bogus'] })).toEqual(['key_actives.0']);
    expect(paths({ ...valid, ingredients_text: 'x'.repeat(2001) })).toEqual(['ingredients_text']);
  });
});

describe('row ↔ form', () => {
  const row: ProductRow = { id: 'p1', name: 'Toner', brand: null, category: 'toner', use_time: 'am', key_actives: ['aha', 'bogus'], ingredients_text: null, opened_at: '2026-01-02', status: 'paused', created_at: '' };

  it('toFormInput fills defaults and drops unknown codes', () => {
    expect(toFormInput(null)).toEqual(emptyProduct);
    expect(toFormInput(row)).toEqual({ name: 'Toner', brand: '', category: 'toner', use_time: 'am', key_actives: ['aha'], ingredients_text: '', opened_at: '2026-01-02', status: 'paused' });
    expect(toFormInput({ ...row, category: 'weird', use_time: 'noon', status: 'lost' })).toMatchObject({ category: null, use_time: 'both', status: 'active' });
  });

  it('toInsert turns empty strings into null and trims', () => {
    expect(toInsert({ ...valid, name: ' Toner ', brand: ' ', ingredients_text: '', opened_at: '' })).toEqual({
      name: 'Toner', brand: null, category: 'toner', use_time: 'both', key_actives: [], ingredients_text: null, opened_at: null, status: 'active',
    });
  });
});
