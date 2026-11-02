export const LOCALES = ['en', 'zh-TW'] as const;
export type Locale = (typeof LOCALES)[number];

// Language names are always shown in their own language.
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', 'zh-TW': '繁體中文' };

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

// Choice saved on device, else device language (en* → en, rest → zh-TW). The server never overrides it.
export function resolveLocale(i: { deviceChoice?: string | null; deviceTag?: string | null }): Locale {
  if (isLocale(i.deviceChoice)) return i.deviceChoice;
  return i.deviceTag?.toLowerCase().startsWith('en') ? 'en' : 'zh-TW';
}
