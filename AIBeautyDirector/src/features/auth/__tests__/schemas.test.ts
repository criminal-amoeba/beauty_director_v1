import {
  authErrorKey, codeSchema, COUNTRIES, emptyIdentity, loginSchema, resetRequestSchema, setPasswordSchema, signUpSchema, toE164,
} from '../schemas';
import en from '@/lib/i18n/en.json';
import zhTW from '@/lib/i18n/zh-TW.json';

// Field path → first message, like the form shows it.
const errorsOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]));

const email = (email: string) => ({ ...emptyIdentity, email });
const phone = (national: string, country: 'TW' | 'HK' | 'US' = 'TW') => ({ ...emptyIdentity, method: 'phone' as const, phone: { country, national } });

describe('toE164', () => {
  it('accepts Taiwan mobiles as 09xxxxxxxx, with spaces or dashes', () => {
    expect(toE164('TW', '0912345678')).toBe('+886912345678');
    expect(toE164('TW', '0912 345 678')).toBe('+886912345678');
    expect(toE164('TW', '0912-345-678')).toBe('+886912345678');
  });

  it('rejects other Taiwan shapes', () => {
    expect(toE164('TW', '912345678')).toBeNull(); // missing 0
    expect(toE164('TW', '0212345678')).toBeNull(); // landline
    expect(toE164('TW', '091234567')).toBeNull(); // too short
    expect(toE164('TW', '09123456789')).toBeNull(); // too long
    expect(toE164('TW', '+886912345678')).toBeNull(); // country code belongs in the picker
  });

  it('drops one leading 0 for other countries and caps E.164 at 15 digits', () => {
    expect(toE164('HK', '91234567')).toBe('+85291234567');
    expect(toE164('US', '2025550123')).toBe('+12025550123');
    expect(toE164('HK', '091234567')).toBe('+85291234567');
    expect(toE164('HK', '12345')).toBeNull();
    expect(toE164('HK', '1234567890123')).toBeNull(); // 3 + 13 > 15
    expect(toE164('HK', '9123abc')).toBeNull();
  });
});

describe('loginSchema', () => {
  it('outputs credentials with a normalized email', () => {
    const r = loginSchema.safeParse({ ...email('  Amy@Example.COM '), password: 'x' });
    expect(r.success && r.data).toEqual({ method: 'email', id: 'amy@example.com', password: 'x' });
  });

  it('outputs E.164 for phone and ignores the inactive email field', () => {
    const r = loginSchema.safeParse({ ...phone('0912345678'), email: 'not an email', password: 'old' });
    expect(r.success && r.data).toEqual({ method: 'phone', id: '+886912345678', password: 'old' });
  });

  it('reports every missing field at once', () => {
    expect(errorsOf(loginSchema.safeParse({ ...email(''), password: '' }))).toEqual({
      email: 'auth.validation.required',
      password: 'auth.validation.required',
    });
    expect(errorsOf(loginSchema.safeParse({ ...phone(''), password: '' }))).toEqual({
      'phone.national': 'auth.validation.required',
      password: 'auth.validation.required',
    });
  });

  it('flags malformed emails and phones', () => {
    expect(errorsOf(loginSchema.safeParse({ ...email('amy@'), password: 'x' }))).toEqual({ email: 'auth.validation.email' });
    expect(errorsOf(loginSchema.safeParse({ ...phone('12345'), password: 'x' }))).toEqual({ 'phone.national': 'auth.validation.phone' });
  });

  it('does not enforce the new-password length (older accounts)', () => {
    expect(loginSchema.safeParse({ ...email('a@b.co'), password: '123' }).success).toBe(true);
  });
});

describe('signUpSchema', () => {
  const valid = { ...email('a@b.co'), password: 'longenough1', confirm: 'longenough1' };

  it('accepts matching passwords of 8-72 characters', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
    expect(signUpSchema.safeParse({ ...valid, password: 'x1'.repeat(36), confirm: 'x1'.repeat(36) }).success).toBe(true);
  });

  it('flags short, long and mismatched passwords', () => {
    expect(errorsOf(signUpSchema.safeParse({ ...valid, password: 'short', confirm: 'short' }))).toEqual({ password: 'auth.validation.passwordShort' });
    expect(errorsOf(signUpSchema.safeParse({ ...valid, password: 'x1'.repeat(36) + 'x', confirm: 'x1'.repeat(36) + 'x' }))).toEqual({ password: 'auth.validation.passwordLong' });
    expect(errorsOf(signUpSchema.safeParse({ ...valid, confirm: 'different!' }))).toEqual({ confirm: 'auth.validation.mismatch' });
  });

  it('requires an ASCII letter and a digit, like Supabase "Letters and digits"', () => {
    const pw = (password: string) => errorsOf(signUpSchema.safeParse({ ...valid, password, confirm: password }));
    expect(pw('12345678')).toEqual({ password: 'auth.validation.passwordLetter' });
    expect(pw('abcdefgh')).toEqual({ password: 'auth.validation.passwordDigit' });
    expect(pw('密碼密碼密碼12')).toEqual({ password: 'auth.validation.passwordLetter' }); // CJK is not a letter to Supabase
    expect(pw('abc1')).toEqual({ password: 'auth.validation.passwordShort' }); // length first
  });

  it('works for phone sign-up', () => {
    const r = signUpSchema.safeParse({ ...phone('0912345678'), password: 'longenough1', confirm: 'longenough1' });
    expect(r.success && r.data.id).toBe('+886912345678');
  });
});

describe('reset schemas', () => {
  it('resolves the reset target', () => {
    const r = resetRequestSchema.safeParse(phone('0912 345 678'));
    expect(r.success && r.data).toEqual({ method: 'phone', id: '+886912345678' });
  });

  it('requires a 6-digit code', () => {
    expect(codeSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(errorsOf(codeSchema.safeParse({ code: '12345' }))).toEqual({ code: 'auth.validation.otp' });
    expect(codeSchema.safeParse({ code: '12345a' }).success).toBe(false);
  });

  it('validates the new password and confirmation', () => {
    expect(setPasswordSchema.safeParse({ password: 'longenough1', confirm: 'longenough1' }).success).toBe(true);
    expect(errorsOf(setPasswordSchema.safeParse({ password: 'short', confirm: 'other' }))).toEqual({
      password: 'auth.validation.passwordShort',
      confirm: 'auth.validation.mismatch',
    });
  });
});

describe('authErrorKey', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {})); // dev warning for unmapped codes
  it('maps known Supabase codes, network failures and the rest', () => {
    expect(authErrorKey(null)).toBeNull();
    expect(authErrorKey({ code: 'invalid_credentials' })).toBe('auth.errors.invalidCredentials');
    expect(authErrorKey({ code: 'phone_exists' })).toBe('auth.errors.alreadyExists');
    expect(authErrorKey({ code: 'over_sms_send_rate_limit' })).toBe('auth.errors.rateLimited');
    expect(authErrorKey({ code: 'sms_send_failed' })).toBe('auth.errors.sendFailed');
    expect(authErrorKey({ name: 'AuthRetryableFetchError', status: 0 })).toBe('auth.errors.network');
    expect(authErrorKey({ name: 'AuthRetryableFetchError', status: 500 })).toBe('auth.errors.server'); // hook/server, not offline
    expect(authErrorKey({ code: 'hook_payload_over_size_limit', status: 500 })).toBe('auth.errors.sendFailed');
    expect(authErrorKey({ code: 'weak_password', status: 422 })).toBe('auth.errors.weakPassword');
    expect(authErrorKey({ code: 'user_banned' })).toBe('auth.errors.banned');
    expect(authErrorKey({ code: 'signup_disabled' })).toBe('auth.errors.unavailable');
    expect(authErrorKey({ code: 'session_not_found' })).toBe('auth.errors.sessionExpired');
    expect(authErrorKey({ code: 'something_new' })).toBe('auth.errors.generic');
    expect(authErrorKey({})).toBe('auth.errors.generic');
  });
});

describe('COUNTRIES', () => {
  it('has unique codes, digit-only dial codes, and a label in both languages for each', () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) expect({ c, ok: /^\d{1,4}$/.test(c.dial) }).toEqual({ c, ok: true });
    expect(Object.keys(en.codes.country).sort()).toEqual([...codes].sort());
    expect(Object.keys(zhTW.codes.country).sort()).toEqual([...codes].sort());
  });
});
