import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { SCAN_ERROR_CODES, ScanError, scanErrorKey, toScanError } from '../errors';
import en from '@/lib/i18n/en.json';

const http = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('toScanError', () => {
  it('reads the code from an HTTP error body', async () => {
    const e = await toScanError(http(403, { error: 'consent_required' }));
    expect(e).toBeInstanceOf(ScanError);
    expect(e.code).toBe('consent_required');
    expect(e.status).toBe(403);
  });
  it('maps unknown codes, non-JSON bodies and relay errors to unknown', async () => {
    expect((await toScanError(http(500, { error: 'something_new' }))).code).toBe('unknown');
    expect((await toScanError(new FunctionsHttpError(new Response('<html>', { status: 502 })))).code).toBe('unknown');
    expect((await toScanError(new FunctionsRelayError(new Response('', { status: 500 })))).code).toBe('unknown');
    expect((await toScanError(new Error('x'))).code).toBe('unknown');
  });
  it('maps a failed fetch to offline and passes ScanError through', async () => {
    expect((await toScanError(new FunctionsFetchError(new TypeError('Network request failed')))).code).toBe('offline');
    const own = new ScanError('capture_failed');
    expect(await toScanError(own)).toBe(own);
  });
});

describe('scanErrorKey', () => {
  it('has a translation for every code', () => {
    const keys = Object.keys((en as { scan: { errors: Record<string, string> } }).scan.errors);
    for (const code of SCAN_ERROR_CODES) expect({ code, has: keys.includes(scanErrorKey(code)) }).toEqual({ code, has: true });
  });
  it('groups provider auth and credit problems as unavailable', () => {
    expect(scanErrorKey('provider_auth')).toBe('unavailable');
    expect(scanErrorKey('provider_credits')).toBe('unavailable');
    expect(scanErrorKey('provider_timeout')).toBe('timeout');
    expect(scanErrorKey('not_due')).toBe('not_due');
  });
});
