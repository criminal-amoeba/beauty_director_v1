import type { User } from '@supabase/supabase-js';
import { accountKey, decideRoute, isVerified, type GuardInput } from '../guard';

const base: GuardInput = {
  bootReady: true,
  hasSession: true,
  hasPending: false,
  verified: true,
  onboardingCompleted: true,
  error: false,
  recovering: false,
};
const route = (over: Partial<GuardInput>) => decideRoute({ ...base, ...over });

describe('decideRoute', () => {
  it('waits for boot, session restore and device state', () => {
    expect(route({ bootReady: false })).toBe('loading');
    expect(route({ hasSession: undefined })).toBe('loading');
    expect(route({ hasPending: undefined })).toBe('loading');
  });

  it('sends signed-out users without a pending account to auth', () => {
    expect(route({ hasSession: false, onboardingCompleted: undefined })).toBe('auth');
  });

  it('sends an unverified account straight to verify (onboarding comes after)', () => {
    expect(route({ hasSession: false, hasPending: true, onboardingCompleted: false })).toBe('verify');
  });

  it('never lets an unverified session into the app', () => {
    expect(route({ verified: false })).toBe('verify');
    expect(route({ verified: false, error: true })).toBe('verify');
  });

  it('shows the error state before anything that needs the profile', () => {
    expect(route({ error: true })).toBe('error');
    expect(route({ error: true, onboardingCompleted: undefined })).toBe('error');
  });

  it('waits for the profile', () => {
    expect(route({ onboardingCompleted: undefined })).toBe('loading');
  });

  it('routes to onboarding until completed', () => {
    expect(route({ onboardingCompleted: false })).toBe('onboarding');
  });

  it('lets verified, onboarded users into the app', () => {
    expect(route({})).toBe('app');
    expect(route({ hasPending: true })).toBe('app'); // a session outranks a stale pending record
  });
});

describe('password recovery', () => {
  it('sends a reset-code session to the new-password screen before anything else', () => {
    expect(route({ recovering: true })).toBe('reset-password');
    expect(route({ recovering: true, onboardingCompleted: false })).toBe('reset-password');
    expect(route({ recovering: true, hasSession: false })).toBe('auth'); // flag without a session does nothing
  });
});

describe('isVerified', () => {
  const user = (over: Partial<User>) => ({ app_metadata: {}, ...over }) as User;
  it('accepts a confirmed email, a confirmed phone, or LINE', () => {
    expect(isVerified(user({ email_confirmed_at: '2026-10-29' }))).toBe(true);
    expect(isVerified(user({ phone_confirmed_at: '2026-10-29' }))).toBe(true);
    expect(isVerified(user({ app_metadata: { providers: ['custom:line'] } }))).toBe(true);
    expect(isVerified(user({ app_metadata: { providers: ['line'] } }))).toBe(false);
    expect(isVerified(user({}))).toBe(false);
  });
});

describe('accountKey', () => {
  it('normalizes email case and the phone + prefix', () => {
    expect(accountKey({ email: ' Amy@Example.com ', userId: 'u1' })).toBe('amy@example.com');
    expect(accountKey({ phone: '+886912345678', userId: 'u1' })).toBe('886912345678');
    expect(accountKey({ email: '', phone: '', userId: 'u1' })).toBe('u1');
  });
});
