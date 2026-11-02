import { z } from 'zod';
import type en from '@/lib/i18n/en.json';
import { COUNTRIES } from './countries';

// Error messages are i18n keys, translated where they are shown.
export type ValidationKey = `auth.validation.${keyof typeof en.auth.validation}`;
export type AuthErrorKey = `auth.errors.${keyof typeof en.auth.errors}`;

export { COUNTRIES };
export type CountryCode = (typeof COUNTRIES)[number]['code'];
export const dialCode = (country: CountryCode) => COUNTRIES.find((c) => c.code === country)!.dial;

// National number as typed → E.164 ('+8869…'), or null if invalid.
export function toE164(country: CountryCode, national: string): string | null {
  const digits = national.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (country === 'TW') return /^09\d{8}$/.test(digits) ? `+886${digits.slice(1)}` : null;
  const dial = dialCode(country);
  const subscriber = digits.replace(/^0/, '');
  return subscriber.length >= 6 && dial.length + subscriber.length <= 15 ? `+${dial}${subscriber}` : null;
}

// Mirrors Supabase Auth password rules (min 8, "Letters and digits"; ASCII letters only). 72 = bcrypt's input limit.
const newPassword = z
  .string()
  .min(8, 'auth.validation.passwordShort')
  .max(72, 'auth.validation.passwordLong')
  .regex(/[A-Za-z]/, 'auth.validation.passwordLetter')
  .regex(/\d/, 'auth.validation.passwordDigit');
const emailFormat = z.email();

// Forms hold both identifiers and validate only the active one, so one form serves the Email | Phone toggle.
// All checks live in superRefine so every field error shows at once.
const base = {
  method: z.enum(['email', 'phone']),
  email: z.string(),
  phone: z.object({ country: z.enum(COUNTRIES.map((c) => c.code) as [CountryCode, ...CountryCode[]]), national: z.string() }),
};
type Base = { method: 'email' | 'phone'; email: string; phone: { country: CountryCode; national: string } };
export type PhoneValue = Base['phone'];
export type IdentityInput = Base;

const issue = (ctx: z.RefinementCtx, path: string[], message: ValidationKey) => ctx.addIssue({ code: 'custom', path, message });

function checkId(v: Base, ctx: z.RefinementCtx) {
  if (v.method === 'email') {
    const email = v.email.trim();
    if (!email) issue(ctx, ['email'], 'auth.validation.required');
    else if (!emailFormat.safeParse(email).success) issue(ctx, ['email'], 'auth.validation.email');
  } else if (!v.phone.national.trim()) issue(ctx, ['phone', 'national'], 'auth.validation.required');
  else if (!toE164(v.phone.country, v.phone.national)) issue(ctx, ['phone', 'national'], 'auth.validation.phone');
}

function checkNewPassword(v: { password: string; confirm: string }, ctx: z.RefinementCtx) {
  const r = newPassword.safeParse(v.password);
  if (!r.success) issue(ctx, ['password'], r.error.issues[0].message as ValidationKey);
  if (v.password !== v.confirm) issue(ctx, ['confirm'], 'auth.validation.mismatch');
}

const idOf = (v: Base) => (v.method === 'email' ? v.email.trim().toLowerCase() : toE164(v.phone.country, v.phone.national)!);

export const loginSchema = z
  .object({ ...base, password: z.string() })
  .superRefine((v, ctx) => {
    checkId(v, ctx);
    // Existing accounts may have older, shorter passwords: login only requires one.
    if (!v.password) issue(ctx, ['password'], 'auth.validation.required');
  })
  .transform((v) => ({ method: v.method, id: idOf(v), password: v.password }));

export const signUpSchema = z
  .object({ ...base, password: z.string(), confirm: z.string() })
  .superRefine((v, ctx) => {
    checkId(v, ctx);
    checkNewPassword(v, ctx);
  })
  .transform((v) => ({ method: v.method, id: idOf(v), password: v.password }));

export const resetRequestSchema = z
  .object(base)
  .superRefine(checkId)
  .transform((v) => ({ method: v.method, id: idOf(v) }));

export const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'auth.validation.otp') });

export const setPasswordSchema = z.object({ password: z.string(), confirm: z.string() }).superRefine(checkNewPassword);

export const emptyIdentity: Base = { method: 'email', email: '', phone: { country: 'TW', national: '' } };

// Supabase auth error → i18n key. Only status 0 (no response) is offline: auth-js also labels every
// server 5xx 'AuthRetryableFetchError', and those are server/hook failures, not the user's connection.
const KNOWN: Record<string, keyof typeof en.auth.errors> = {
  invalid_credentials: 'invalidCredentials',
  user_already_exists: 'alreadyExists',
  email_exists: 'alreadyExists',
  phone_exists: 'alreadyExists',
  weak_password: 'weakPassword',
  same_password: 'samePassword',
  otp_expired: 'otpExpired',
  over_email_send_rate_limit: 'rateLimited',
  over_sms_send_rate_limit: 'rateLimited',
  over_request_rate_limit: 'rateLimited',
  sms_send_failed: 'sendFailed',
  email_address_not_authorized: 'sendFailed', // built-in SMTP only mails team members
  user_banned: 'banned',
  signup_disabled: 'unavailable',
  email_provider_disabled: 'unavailable',
  phone_provider_disabled: 'unavailable',
  provider_disabled: 'unavailable',
  session_expired: 'sessionExpired',
  session_not_found: 'sessionExpired',
  reauthentication_needed: 'sessionExpired',
  unexpected_failure: 'server',
  request_timeout: 'server',
};

export function authErrorKey(error: { code?: string; name?: string; status?: number } | null | undefined): AuthErrorKey | null {
  if (!error) return null;
  if (error.status === 0) return 'auth.errors.network';
  const known = error.code && (KNOWN[error.code] ?? (error.code.startsWith('hook_') ? 'sendFailed' : undefined));
  if (known) return `auth.errors.${known}`;
  if (__DEV__) console.warn('[auth] unmapped error code:', error.code ?? `status ${error.status}`); // code only, never user data
  return `auth.errors.${error.status && error.status >= 500 ? 'server' : 'generic'}`;
}
