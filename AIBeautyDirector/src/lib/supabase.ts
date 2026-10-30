import './crypto-polyfill'; // first: auth-js checks for WebCrypto when it builds PKCE codes
import { AppState, Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { deviceStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env, fill it in, and restart Metro.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : deviceStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    // Links and LINE redirects carry a one-time code that only this device's stored verifier can redeem.
    // Verifier and S256 challenge come from expo-crypto (crypto-polyfill.ts).
    flowType: 'pkce',
  },
});

// Native timers pause in the background; refresh only while the app is in the foreground (Supabase RN docs).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
