import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

// Error codes the scan functions return (supabase/functions/_shared/codes.ts) plus client-side ones.
export const SCAN_ERROR_CODES = [
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
  'capture_failed',
  'upload_failed',
  'offline',
  'unknown',
] as const;
export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number];

export class ScanError extends Error {
  constructor(
    readonly code: ScanErrorCode,
    readonly status?: number,
    readonly detail?: unknown,
  ) {
    super(code);
  }
}

// Which translation key (`scan.errors.<key>`) explains a code to the user.
export type ScanErrorKey =
  | 'capture_failed'
  | 'upload_failed'
  | 'offline'
  | 'generic'
  | 'disabled'
  | 'unauthorized'
  | 'consent_required'
  | 'not_due'
  | 'in_progress'
  | 'unavailable'
  | 'image_too_large'
  | 'rate_limited'
  | 'timeout'
  | 'provider_failed'
  | 'invalid_result';

export function scanErrorKey(code: ScanErrorCode): ScanErrorKey {
  switch (code) {
    case 'provider_auth':
    case 'provider_credits':
    case 'llm_not_configured':
      return 'unavailable';
    case 'provider_rate_limited':
      return 'rate_limited';
    case 'provider_timeout':
      return 'timeout';
    case 'scan_in_progress':
      return 'in_progress';
    case 'db_failed':
    case 'storage_failed':
    case 'photo_missing':
    case 'invalid_path':
    case 'unknown':
      return 'generic';
    default:
      return code;
  }
}

const isCode = (v: unknown): v is ScanErrorCode => (SCAN_ERROR_CODES as readonly unknown[]).includes(v);

// functions.invoke error → ScanError. HTTP errors carry `{ error: code }`; a failed fetch is "offline".
export async function toScanError(error: unknown): Promise<ScanError> {
  if (error instanceof ScanError) return error;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response | undefined;
    const body = (await res?.json().catch(() => null)) as { error?: unknown } | null;
    return new ScanError(isCode(body?.error) ? body.error : 'unknown', res?.status, body);
  }
  if (error instanceof FunctionsFetchError) return new ScanError('offline');
  return new ScanError('unknown', undefined, error);
}
