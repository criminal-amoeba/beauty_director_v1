import en from '@/lib/i18n/en.json';
import zhTW from '@/lib/i18n/zh-TW.json';
import {
  BUDGETS, CATEGORIES, GENDERS, GOALS, INGREDIENTS, KEY_ACTIVES, LEVELS, PERSONAS, PRODUCT_STATUSES, REACTIONS, SEVERITIES, TEXTURES, USE_TIMES,
} from '../codes';
import { basicsSchema, productSchema, toBirthDate } from '../schemas';

const today = new Date('2026-10-30T12:00:00Z');

describe('toBirthDate', () => {
  it('pads a valid date to YYYY-MM-DD', () => {
    expect(toBirthDate('1995', '4', '3', today)).toBe('1995-04-03');
    expect(toBirthDate('2000', '02', '29', today)).toBe('2000-02-29'); // leap year
  });

  it('rejects dates that do not exist', () => {
    expect(toBirthDate('1999', '2', '29', today)).toBeNull();
    expect(toBirthDate('1999', '13', '1', today)).toBeNull();
    expect(toBirthDate('1999', '4', '31', today)).toBeNull();
    expect(toBirthDate('1999', '0', '10', today)).toBeNull();
  });

  it('rejects the future, before 1900 and malformed input', () => {
    expect(toBirthDate('2026', '10', '31', today)).toBeNull();
    expect(toBirthDate('1899', '12', '31', today)).toBeNull();
    expect(toBirthDate('95', '4', '3', today)).toBeNull();
    expect(toBirthDate('', '', '', today)).toBeNull();
  });

  it('does not check age: a 10-year-old passes, the DB trigger rejects it', () => {
    expect(toBirthDate('2016', '1', '1', today)).toBe('2016-01-01');
  });
});

describe('basicsSchema', () => {
  const valid = { name: ' Amy ', year: '1995', month: '4', day: '3', gender: 'female' as const };
  it('accepts a complete answer and trims the name', () => {
    expect(basicsSchema.parse(valid).name).toBe('Amy');
  });
  it('flags a missing name, a bad date and a missing gender', () => {
    const r = basicsSchema.safeParse({ ...valid, name: '  ', day: '31', month: '2', gender: null });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.')).sort()).toEqual(['gender', 'name', 'year']);
  });
});

describe('productSchema', () => {
  it('trims and accepts a name with an optional brand', () => {
    expect(productSchema.parse({ name: '  Gel Cream ', brand: '', category: 'moisturizer' })).toEqual({ name: 'Gel Cream', brand: '', category: 'moisturizer' });
  });
  it('requires a name and a category, and caps the lengths', () => {
    const r = productSchema.safeParse({ name: ' ', brand: 'x'.repeat(81), category: null });
    expect(r.success ? [] : r.error.issues.map((i) => i.path.join('.')).sort()).toEqual(['brand', 'category', 'name']);
    expect(productSchema.safeParse({ name: 'x'.repeat(121), brand: '', category: 'other' }).success).toBe(false);
  });
});

describe('code labels', () => {
  const groups = {
    gender: GENDERS, goal: GOALS, level: LEVELS, budget: BUDGETS, texture: TEXTURES,
    ingredient: INGREDIENTS, reaction: REACTIONS, severity: SEVERITIES, category: CATEGORIES,
    actives: KEY_ACTIVES, useTime: USE_TIMES, productStatus: PRODUCT_STATUSES, persona: PERSONAS,
  };
  it.each(Object.entries(groups))('every %s code has an en and a zh-TW label', (group, codes) => {
    for (const lang of [en, zhTW]) {
      const labels = (lang.codes as Record<string, Record<string, unknown>>)[group] ?? {};
      expect(Object.keys(labels).sort()).toEqual([...codes].sort());
    }
  });
});
