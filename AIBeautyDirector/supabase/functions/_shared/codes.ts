// Constants and error codes shared by the scan functions. The app translates codes; functions never send sentences.

export const PROVIDER = 'dermiq';
export const CAPTURE_PROTOCOL_VERSION = 'cp1'; // front camera + live QA v1
export const METRIC_DEFINITION_VERSION = 'v1';
export const SCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// Server-side 7-day gate: only succeeded scans count (the client countdown in features/scan/due.ts is cosmetic).
export const isDue = (lastSucceededAt: string | null, now: number) =>
  !lastSucceededAt || now - Date.parse(lastSucceededAt) >= SCAN_INTERVAL_MS;

// The eight metrics every valid scan must have; the rest are optional sub-areas.
export const CORE_METRIC_CODES = [
  'breakout_visibility',
  'wrinkle_visibility',
  'pore_visibility',
  'redness_appearance',
  'oiliness_balance',
  'texture_smoothness',
  'dark_circle_visibility',
  'firmness_appearance',
] as const;
export const OPTIONAL_METRIC_CODES = ['hydration_balance', 'wrinkle_forehead', 'wrinkle_crow_feet', 'wrinkle_nasolabial'] as const;
export const METRIC_CODES = [...CORE_METRIC_CODES, ...OPTIONAL_METRIC_CODES] as const;
export type MetricCode = (typeof METRIC_CODES)[number];

export type Metric = { metric_code: MetricCode; value: number; metric_definition_version: string };

export const ERROR_CODES = [
  'unauthorized',
  'consent_required',
  'invalid_path',
  'not_due',
  'scan_in_progress',
  'photo_missing',
  'provider_auth',
  'provider_credits',
  'image_too_large',
  'provider_rate_limited',
  'provider_timeout',
  'provider_failed',
  'invalid_result',
  'db_failed',
  'storage_failed',
  'disabled',
  'llm_not_configured',
  // chat
  'invalid_request',
  'message_too_long',
  'rate_limited',
  'thread_busy',
  'forbidden',
  'already_acted',
  'block_not_found',
  'action_mismatch',
  'invalid_action',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class ScanError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(code);
  }
}

// Photos live at scan-images/{user_id}/{uuid}.jpg (flat, so delete-account's folder sweep finds them).
// Only a path under the caller's own folder with that exact shape is ever read or deleted by a function.
export const isOwnImagePath = (userId: string, path: unknown): path is string =>
  typeof path === 'string' && /^[0-9a-f-]{36}$/i.test(userId) && new RegExp(`^${userId}/[0-9a-f-]{36}\\.jpg$`, 'i').test(path);

export const LOCALES = ['en', 'zh-TW'] as const;
export type Locale = (typeof LOCALES)[number];
// Same rule as the app and send-sms: en* → en, anything else → zh-TW.
export const toLocale = (v: unknown): Locale =>
  typeof v === 'string' && v.toLowerCase().startsWith('en') ? 'en' : 'zh-TW';
