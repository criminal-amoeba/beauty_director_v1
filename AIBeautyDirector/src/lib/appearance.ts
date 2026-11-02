import { Appearance } from 'react-native';
import { deviceStorage } from '@/lib/storage';

// Light / dark / match the device, chosen in Settings and saved on this device. Appearance.setColorScheme makes
// every useColorScheme (so useTheme and the native chrome) follow the choice. shortcut: no-op on web, where the
// browser's scheme always wins; fine while web is only a preview.
export const APPEARANCES = ['system', 'light', 'dark'] as const;
export type AppearanceChoice = (typeof APPEARANCES)[number];

const KEY = 'appearance_choice';
let current: AppearanceChoice = 'system';

export const toAppearance = (v: unknown): AppearanceChoice => ((APPEARANCES as readonly unknown[]).includes(v) ? (v as AppearanceChoice) : 'system');
export const currentAppearance = () => current;

const apply = (choice: AppearanceChoice) => {
  current = choice;
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
};

// Called once at boot, before the splash leaves.
// "Match device" at boot needs no call: the app already follows the device, and on Android the call itself can
// recreate the window (system bars, insets). Only a stored light/dark choice is applied.
export async function loadAppearance() {
  const choice = toAppearance(await deviceStorage.getItem(KEY).catch(() => null));
  if (choice === 'system') current = 'system';
  else apply(choice);
}

export async function setAppearance(choice: AppearanceChoice) {
  apply(choice);
  await deviceStorage.setItem(KEY, choice).catch(() => {});
}
