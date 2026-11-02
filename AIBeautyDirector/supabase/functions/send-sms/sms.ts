// Pure helpers for the send-sms hook (tested in Jest).

export type SmsLocale = 'en' | 'zh-TW';

// Same rule as the app: en* → English, anything else (or missing) → Traditional Chinese.
export const smsLocale = (v: unknown): SmsLocale =>
  typeof v === 'string' && v.toLowerCase().startsWith('en') ? 'en' : 'zh-TW';

// One segment each (zh-TW is UCS-2: max 70 chars). No URL (Labspace blocks unlisted domains), no leading [brand] tag.
export const smsBody = (locale: SmsLocale, otp: string) =>
  locale === 'en'
    ? `Your AI Beauty Director code is ${otp}. Don't share it with anyone.`
    : `您的 AI Beauty Director 驗證碼為 ${otp}，請勿提供給任何人。`;

// Supabase stores phones as digits without '+'; Labspace wants the same.
export const labspaceNumber = (phone: string) => phone.replace(/^\+/, '');

export type Outcome = { ok: true; duplicate: boolean } | { ok: false; code: string };

// Labspace /api/v2/send response → outcome. result 1 = accepted (rejections are result 0, nothing sent).
// The docs only show a multi-number reply; a single-number reply may lack data.results, so only an explicit
// failure marker counts against result 1. A duplicate (same text, same number, < 10 min) sends nothing,
// but the earlier identical code is still valid, so it counts as success.
export function labspaceOutcome(httpStatus: number, json: unknown): Outcome {
  const r = (json ?? {}) as {
    result?: number;
    code?: unknown;
    data?: { duplicate?: unknown; sent?: unknown; results?: { status?: unknown }[] };
  };
  if (r.result === 1) {
    if (r.data?.duplicate) return { ok: true, duplicate: true };
    const status = r.data?.results?.[0]?.status;
    if (status !== undefined && status !== 'success') return { ok: false, code: `STATUS_${String(status).toUpperCase()}` };
    if (r.data?.sent === 0) return { ok: false, code: 'NOT_SENT' };
    return { ok: true, duplicate: false };
  }
  return { ok: false, code: typeof r.code === 'string' ? r.code : `HTTP_${httpStatus}` };
}
