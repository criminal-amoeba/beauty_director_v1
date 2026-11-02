import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { supabase } from '@/lib/supabase';
import { deviceStorage } from '@/lib/storage';
import en from './en.json';
import zhTW from './zh-TW.json';
import { isLocale, resolveLocale, type Locale } from './resolve';

export { LOCALE_NAMES, LOCALES, type Locale } from './resolve';

const CHOICE_KEY = 'locale_choice';
const deviceTag = () => getLocales()[0]?.languageTag ?? null;

// Own instance, registered with react-i18next. Synchronous init (inline resources) so t() works on the first render.
export const i18n = createInstance();
i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-TW': { translation: zhTW } },
  lng: resolveLocale({ deviceTag: deviceTag() }),
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export const currentLocale = (): Locale => (isLocale(i18n.language) ? i18n.language : 'zh-TW');

// Called once at boot, before the guard leaves the splash.
export async function loadDeviceLocale() {
  const deviceChoice = await deviceStorage.getItem(CHOICE_KEY).catch(() => null);
  await i18n.changeLanguage(resolveLocale({ deviceChoice, deviceTag: deviceTag() }));
}

// The language on screen is always the user's choice; sign-in, sign-up and sign-out never change it.
// The server keeps a copy for what it writes: user_settings.locale (AI replies) and auth metadata (SMS).
// `saved` = the server's current values; only differing ones are written.
export async function saveServerLocale(userId: string, saved: { settings?: unknown; metadata?: unknown } = {}) {
  const locale = currentLocale();
  const [s, m] = await Promise.all([
    saved.settings === locale ? null : supabase.from('user_settings').update({ locale }).eq('user_id', userId),
    saved.metadata === locale ? null : supabase.auth.updateUser({ data: { locale } }),
  ]);
  const code = s?.error?.code ?? m?.error?.code;
  if (code) console.warn('locale not saved to the server', code);
}

// User switch: instant, saved on device and (when signed in) on the server.
export async function setLocale(locale: Locale) {
  await i18n.changeLanguage(locale);
  await deviceStorage.setItem(CHOICE_KEY, locale).catch(() => {});
  const { data } = await supabase.auth.getSession();
  if (data.session) await saveServerLocale(data.session.user.id);
}
