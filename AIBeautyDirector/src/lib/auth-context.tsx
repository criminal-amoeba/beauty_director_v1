import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { FunctionsFetchError, type AuthError, type Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { readJson, writeJson, deviceStorage } from './storage';
import { parseAuthCallback } from './auth-link';
import { accountKey, isVerified, LINE_PROVIDER, type GuardInput } from './guard';
import { currentLocale, saveServerLocale } from './i18n';
import { cancelReminders } from './notifications';
import { authErrorKey, type AuthErrorKey } from '@/features/auth/schemas';
import { finishOnboarding, type SaveError } from '@/features/onboarding/api';

export type Method = 'email' | 'phone';
// An account that signed up or tried to sign in before verifying. Supabase gives it no session.
// sentAt: when this device last asked for a confirmation email/SMS (0 = unknown), drives the resend cooldown.
export type Pending = { method: Method; id: string; sentAt?: number };
// id = lowercased email, or E.164 phone ('+8869…').
export type Credentials = { method: Method; id: string; password: string };
// Resolves to an i18n error key (auth.errors.*), or null on success.
type Result = Promise<AuthErrorKey | null>;

const PENDING_KEY = 'pending_account';

// Confirmation, reset and LINE redirects land here with a PKCE code. Must be in Supabase's Redirect URLs.
export const authRedirect = () => Linking.createURL('verify');
// LINE's redirect can arrive both as the auth-session result and as a deep link; a code is single-use.
const exchanges = new Map<string, ReturnType<typeof supabase.auth.exchangeCodeForSession>>();
export const exchangeOnce = (authCode: string) => {
  if (!exchanges.has(authCode)) exchanges.set(authCode, supabase.auth.exchangeCodeForSession(authCode));
  return exchanges.get(authCode)!;
};
const notConfirmed = (e: AuthError | null) => e?.code === 'email_not_confirmed' || e?.code === 'phone_not_confirmed';
const keyFor = (method: Method, id: string) => accountKey(method === 'email' ? { email: id, userId: '' } : { phone: id, userId: '' });

type ProfileState = { userId: string; onboardingCompleted?: boolean; error?: boolean };

type AuthContextType = {
  session: Session | null | undefined;
  pending: Pending | null | undefined;
  guard: Omit<GuardInput, 'bootReady'>;
  // Unconfirmed accounts resolve to null too: they are remembered as pending and the guard moves on.
  signIn: (c: Credentials) => Result;
  signUp: (c: Credentials) => Result;
  signInWithLine: () => Result;
  signOut: () => Promise<void>;
  requestPasswordReset: (method: Method, id: string) => Result;
  // Success signs in with recovering = true, so the guard shows the new-password screen.
  verifyPasswordReset: (method: Method, id: string, code: string) => Result;
  updatePassword: (password: string) => Result;
  cancelRecovery: () => Promise<void>;
  deleteAccount: () => Result;
  // Both resolve to an i18n error key, or null on success. Success signs the user in.
  verifyCode: (code: string) => Promise<AuthErrorKey | null>;
  resendVerification: () => Promise<AuthErrorKey | null>;
  linkError: string | null;
  // Marks onboarding done; the guard then moves to the app.
  finishOnboarding: () => Promise<SaveError | null>;
  clearPending: () => Promise<void>;
  discardAccount: () => Promise<void>;
  retry: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [pending, setPendingState] = useState<Pending | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileState | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [sessionLinkError, setSessionLinkError] = useState<string | null>(null);
  // Signed in by a reset code or link; the new password isn't set yet.
  const [recovering, setRecovering] = useState(false);
  const [linkDone, setLinkDone] = useState<string | null>(null);

  const setPending = async (p: Pending | null) => {
    setPendingState(p);
    await (p ? writeJson(PENDING_KEY, p) : deviceStorage.removeItem(PENDING_KEY));
  };

  useEffect(() => {
    readJson<Pending>(PENDING_KEY).then(setPendingState);
    // INITIAL_SESSION delivers the restored session. No Supabase calls inside this callback (supabase-js deadlock).
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true); // reset link redeemed (fires before the exchange resolves)
      if (s) {
        setPendingState(null);
        deviceStorage.removeItem(PENDING_KEY).catch(() => {});
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Tapping a confirmation or reset link on this phone reopens the app with a code: redeem it, once per URL.
  // A link started on another device has no verifier here and fails (Verify shows "link expired").
  const url = Linking.useURL();
  const callback = parseAuthCallback(url);
  const handledUrl = useRef<string | null>(null);
  useEffect(() => {
    if (callback?.type !== 'code' || handledUrl.current === url) return;
    handledUrl.current = url;
    exchangeOnce(callback.authCode).then(({ error }) => {
      setSessionLinkError(error ? (error.code ?? 'generic') : null);
      setLinkDone(url);
    });
  }, [url, callback]);
  // Until the code is redeemed the guard waits, so a reset link never shows Home first.
  const exchanging = callback?.type === 'code' && linkDone !== url;

  const endRecovery = () => setRecovering(false);

  const user = session?.user;
  const userId = user?.id;
  const verified = !!user && isVerified(user);

  useEffect(() => {
    if (!userId || !verified) return;
    let live = true;
    supabase.from('profiles').select('onboarding_completed').eq('user_id', userId).single().then(
      (p) => live && setProfile(p.error ? { userId, error: true } : { userId, onboardingCompleted: p.data.onboarding_completed }),
      () => live && setProfile({ userId, error: true }),
    );
    return () => { live = false; };
  }, [userId, verified, attempt]);

  // Copy the on-screen language to the server. A new LINE account starts at the DB default (zh-TW),
  // since LINE can't carry sign-up metadata; the screen language must not follow it.
  const metaLocale: unknown = user?.user_metadata?.locale;
  useEffect(() => {
    if (!userId || !verified) return;
    supabase.from('user_settings').select('locale').eq('user_id', userId).single()
      .then(({ data }) => saveServerLocale(userId, { settings: data?.locale, metadata: metaLocale }), () => {});
  }, [userId, verified, metaLocale]);

  // A profile loaded for a previous user counts as still loading.
  const current = profile?.userId === userId ? profile : undefined;
  const value: AuthContextType = {
    session,
    pending,
    guard: {
      hasSession: session === undefined || exchanging ? undefined : !!session,
      hasPending: pending === undefined ? undefined : !!pending,
      verified,
      onboardingCompleted: current?.onboardingCompleted,
      error: !!current?.error,
      recovering,
    },
    signIn: async ({ method, id, password }) => {
      const { error } = method === 'email'
        ? await supabase.auth.signInWithPassword({ email: id, password })
        : await supabase.auth.signInWithPassword({ phone: id, password });
      if (!notConfirmed(error)) return authErrorKey(error); // unknown account = invalid_credentials too (no enumeration)
      await setPending({ method, id: keyFor(method, id), sentAt: 0 });
      return null;
    },
    signUp: async ({ method, id, password }) => {
      const data = { locale: currentLocale() };
      const res = method === 'email'
        ? await supabase.auth.signUp({ email: id, password, options: { data, emailRedirectTo: authRedirect() } })
        : await supabase.auth.signUp({ phone: id, password, options: { data } });
      if (res.error) return authErrorKey(res.error);
      // A registered email/phone gets a fake success with no identities and no code sent. Saying so reveals
      // that the account exists (product choice 2026-10-29); login errors still don't.
      if (res.data.user?.identities?.length === 0) return 'auth.errors.alreadyExists';
      if (!res.data.session) await setPending({ method, id: keyFor(method, id), sentAt: Date.now() });
      return null;
    },
    // LINE = Supabase custom OAuth provider; the browser returns to authRedirect with tokens in the fragment.
    signInWithLine: async () => {
      const redirectTo = authRedirect();
      // Must match an entry in Supabase → Auth → URL Configuration → Redirect URLs, or Supabase falls back to the Site URL.
      if (__DEV__) console.log('[auth] LINE redirectTo:', redirectTo);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: LINE_PROVIDER,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return authErrorKey(error);
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return null; // user closed the browser
      const cb = parseAuthCallback(result.url);
      if (cb?.type === 'error' && cb.code === 'access_denied') return null; // user declined on LINE's consent page
      if (cb?.type !== 'code') return 'auth.errors.line';
      const { error: sessionError } = await exchangeOnce(cb.authCode);
      return authErrorKey(sessionError);
    },
    signOut: async () => {
      endRecovery();
      await cancelReminders().catch(() => {}); // the next person on this phone must not get them
      await supabase.auth.signOut();
    },
    requestPasswordReset: async (method, id) => {
      const { error } = method === 'email'
        ? await supabase.auth.resetPasswordForEmail(id, { redirectTo: authRedirect() })
        : await supabase.auth.signInWithOtp({ phone: id, options: { shouldCreateUser: false } });
      // Unknown phone: answer like an unknown email (no account enumeration).
      if (error?.code === 'otp_disabled' || error?.code === 'user_not_found') return null;
      return authErrorKey(error);
    },
    verifyPasswordReset: async (method, id, code) => {
      setRecovering(true); // before the session appears, so the guard never shows Home first
      const { error } = method === 'email'
        ? await supabase.auth.verifyOtp({ email: id, token: code, type: 'recovery' })
        : await supabase.auth.verifyOtp({ phone: id, token: code, type: 'sms' });
      if (error) setRecovering(false);
      return authErrorKey(error);
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) endRecovery();
      return authErrorKey(error);
    },
    cancelRecovery: async () => {
      endRecovery();
      await supabase.auth.signOut();
    },
    deleteAccount: async () => {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) return error instanceof FunctionsFetchError ? 'auth.errors.network' : 'auth.errors.generic';
      await setPending(null);
      await cancelReminders().catch(() => {});
      await supabase.auth.signOut({ scope: 'local' }); // the server session went with the user
      return null;
    },
    verifyCode: async (code) => {
      if (!pending) return 'auth.errors.generic';
      const { error } = pending.method === 'email'
        ? await supabase.auth.verifyOtp({ email: pending.id, token: code, type: 'email' })
        : await supabase.auth.verifyOtp({ phone: `+${pending.id}`, token: code, type: 'sms' });
      return authErrorKey(error);
    },
    resendVerification: async () => {
      if (!pending) return 'auth.errors.generic';
      const { error } = pending.method === 'email'
        ? await supabase.auth.resend({ type: 'signup', email: pending.id, options: { emailRedirectTo: authRedirect() } })
        : await supabase.auth.resend({ type: 'sms', phone: `+${pending.id}` });
      if (error) return authErrorKey(error);
      await setPending({ ...pending, sentAt: Date.now() });
      return null;
    },
    linkError: callback?.type === 'error' ? callback.code : sessionLinkError,
    finishOnboarding: async () => {
      if (!userId) return 'auth.errors.sessionExpired';
      const error = await finishOnboarding(userId);
      if (!error) setProfile({ userId, onboardingCompleted: true });
      return error;
    },
    clearPending: () => setPending(null),
    discardAccount: async () => {
      await setPending(null);
      if (session) await supabase.auth.signOut();
    },
    retry: () => {
      setProfile(undefined);
      setAttempt((n) => n + 1);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
