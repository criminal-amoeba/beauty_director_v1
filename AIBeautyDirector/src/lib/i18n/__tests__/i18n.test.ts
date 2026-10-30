import en from '../en.json';
import zhTW from '../zh-TW.json';
import { resolveLocale } from '../resolve';

describe('resolveLocale', () => {
  it('prefers the device choice, then the device language', () => {
    expect(resolveLocale({ deviceChoice: 'en', deviceTag: 'zh-TW' })).toBe('en');
    expect(resolveLocale({ deviceChoice: 'zh-TW', deviceTag: 'en-US' })).toBe('zh-TW');
    expect(resolveLocale({ deviceChoice: null, deviceTag: 'en-US' })).toBe('en');
  });

  it('maps en* to en and everything else to zh-TW', () => {
    expect(resolveLocale({ deviceTag: 'en-GB' })).toBe('en');
    expect(resolveLocale({ deviceTag: 'EN' })).toBe('en');
    expect(resolveLocale({ deviceTag: 'zh-Hant-TW' })).toBe('zh-TW');
    expect(resolveLocale({ deviceTag: 'ja-JP' })).toBe('zh-TW');
    expect(resolveLocale({ deviceTag: null })).toBe('zh-TW');
    expect(resolveLocale({})).toBe('zh-TW');
  });

  it('ignores invalid stored values', () => {
    expect(resolveLocale({ deviceChoice: 'garbage', deviceTag: 'en-US' })).toBe('en');
    expect(resolveLocale({ deviceChoice: 'zh', deviceTag: 'en-US' })).toBe('en');
  });
});

// Every key path to a string leaf, e.g. "home.am.title".
const leaves = (obj: object, prefix = ''): [string, unknown][] =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? leaves(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, unknown]],
  );

describe('translation files', () => {
  it('have identical keys in en and zh-TW', () => {
    expect(leaves(zhTW).map(([k]) => k).sort()).toEqual(leaves(en).map(([k]) => k).sort());
  });

  it('have no empty or non-string values', () => {
    for (const [key, value] of [...leaves(en), ...leaves(zhTW)]) {
      expect({ key, ok: typeof value === 'string' && value.trim().length > 0 }).toEqual({ key, ok: true });
    }
  });

  it('use the same interpolation variables in both languages', () => {
    const vars = (s: unknown) => String(s).match(/{{\s*\w+\s*}}/g)?.sort() ?? [];
    const zh = Object.fromEntries(leaves(zhTW));
    for (const [key, value] of leaves(en)) expect({ key, vars: vars(zh[key]) }).toEqual({ key, vars: vars(value) });
  });
});
