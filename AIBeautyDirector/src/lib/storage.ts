import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type KeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// SecureStore warns above 2048 bytes and a session is larger, so values are split.
// 600 chars stays under 2048 bytes even if every char is 3-byte UTF-8 (CJK in drafts).
const CHUNK = 600;
const countKey = (key: string) => `${key}.n`;

const chunkedSecureStore: KeyValueStore = {
  async getItem(key) {
    const count = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)),
    );
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(key, value) {
    const old = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    const count = Math.max(1, Math.ceil(value.length / CHUNK));
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(countKey(key), String(count));
    for (let i = count; i < old; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
  async removeItem(key) {
    const count = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    await SecureStore.deleteItemAsync(countKey(key));
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
};

// SecureStore has no web build; web (dev preview only) uses localStorage, absent during static render.
const webStore: KeyValueStore = {
  getItem: async (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  setItem: async (key, value) => { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); },
  removeItem: async (key) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(key); },
};

export const deviceStorage: KeyValueStore = Platform.OS === 'web' ? webStore : chunkedSecureStore;

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await deviceStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const writeJson = (key: string, value: unknown) => deviceStorage.setItem(key, JSON.stringify(value));
