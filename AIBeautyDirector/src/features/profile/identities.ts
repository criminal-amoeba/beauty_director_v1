import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { authRedirect, exchangeOnce } from '@/lib/auth-context';
import { parseAuthCallback } from '@/lib/auth-link';
import { authErrorKey, type AuthErrorKey } from '@/features/auth/schemas';
import { LINE_PROVIDER } from '@/lib/guard';

export { identitiesOf, type Identities } from './identities-of';

// Supabase manual linking ("Allow manual linking" must be ON in the console). Email / phone identities are added
// with updateUser and confirmed with the *_change OTP; OAuth identities with linkIdentity.
export async function linkPhone(e164: string): Promise<AuthErrorKey | null> {
  const { error } = await supabase.auth.updateUser({ phone: e164 });
  return authErrorKey(error);
}

export async function verifyPhoneLink(e164: string, code: string): Promise<AuthErrorKey | null> {
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'phone_change' });
  return authErrorKey(error);
}

export async function linkLine(): Promise<AuthErrorKey | null> {
  const redirectTo = authRedirect();
  const { data, error } = await supabase.auth.linkIdentity({ provider: LINE_PROVIDER, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) return authErrorKey(error);
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // user closed the browser
  const cb = parseAuthCallback(result.url);
  if (cb?.type === 'error' && cb.code === 'access_denied') return null;
  if (cb?.type !== 'code') return 'auth.errors.line';
  const { error: sessionError } = await exchangeOnce(cb.authCode);
  return authErrorKey(sessionError);
}
