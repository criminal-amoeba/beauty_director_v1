import type { User } from '@supabase/supabase-js';

export type Route = 'loading' | 'error' | 'auth' | 'onboarding' | 'verify' | 'reset-password' | 'app';

export type GuardInput = {
  bootReady: boolean; // fonts + stored locale loaded
  hasSession: boolean | undefined; // undefined = still restoring
  hasPending: boolean | undefined; // unverified sign-up/sign-in remembered on device; undefined = loading
  verified: boolean;
  onboardingCompleted: boolean | undefined; // undefined = profile loading
  error: boolean; // profile load failed
  recovering: boolean; // signed in by a password-reset code or link, new password not set yet
};

// The only place that decides where a user may be. Screens change state; they never redirect.
export function decideRoute(i: GuardInput): Route {
  if (!i.bootReady || i.hasSession === undefined || i.hasPending === undefined) return 'loading';
  // Sign up → verify → onboarding: the code is sent at sign-up, so Verify comes right after it.
  if (!i.hasSession) return i.hasPending ? 'verify' : 'auth';
  if (i.recovering) return 'reset-password';
  if (!i.verified) return 'verify';
  if (i.error) return 'error';
  if (i.onboardingCompleted === undefined) return 'loading';
  if (!i.onboardingCompleted) return 'onboarding';
  return 'app';
}

// LINE verifies the account itself. Must match the custom provider identifier in Supabase Auth.
export const LINE_PROVIDER = 'custom:line';

export const isVerified = (user: User) =>
  !!(user.email_confirmed_at || user.phone_confirmed_at || user.app_metadata?.providers?.includes(LINE_PROVIDER));

// One key per remembered unverified account.
// Supabase stores phones without '+'; emails are case-insensitive.
export const accountKey = (id: { email?: string | null; phone?: string | null; userId: string }) =>
  id.email?.trim().toLowerCase() || id.phone?.replace(/^\+/, '') || id.userId;
