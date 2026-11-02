import { labspaceNumber, labspaceOutcome, smsBody, smsLocale } from '../sms';

describe('smsLocale', () => {
  it('maps en* to en and everything else to zh-TW', () => {
    expect(smsLocale('en')).toBe('en');
    expect(smsLocale('en-US')).toBe('en');
    expect(smsLocale('zh-TW')).toBe('zh-TW');
    expect(smsLocale(undefined)).toBe('zh-TW');
    expect(smsLocale(42)).toBe('zh-TW');
  });
});

describe('smsBody', () => {
  it('contains the code, no URL, and fits one segment', () => {
    const en = smsBody('en', '123456');
    const zh = smsBody('zh-TW', '123456');
    expect(en).toContain('123456');
    expect(zh).toContain('123456');
    expect(en.length).toBeLessThanOrEqual(160);
    expect(zh.length).toBeLessThanOrEqual(70); // UCS-2 segment
    expect(`${en} ${zh}`).not.toMatch(/https?:|www\.|^\[/);
  });
});

describe('labspaceNumber', () => {
  it('strips the plus sign', () => {
    expect(labspaceNumber('+886912345678')).toBe('886912345678');
    expect(labspaceNumber('886912345678')).toBe('886912345678');
  });
});

describe('labspaceOutcome', () => {
  it('succeeds when the number was sent', () => {
    expect(labspaceOutcome(200, { result: 1, data: { results: [{ phone: '886912345678', status: 'success' }] } })).toEqual({ ok: true, duplicate: false });
  });

  it('treats a duplicate as success (the earlier code is still valid)', () => {
    expect(labspaceOutcome(200, { result: 1, data: { duplicate: true, points_used: 0 } })).toEqual({ ok: true, duplicate: true });
  });

  it('treats result 1 without per-number details as sent (single-number reply)', () => {
    expect(labspaceOutcome(200, { result: 1, text: 'ok', data: { points_remaining: 99 } })).toEqual({ ok: true, duplicate: false });
    expect(labspaceOutcome(200, { result: 1 })).toEqual({ ok: true, duplicate: false });
  });

  it('fails on an explicit failure marker even when result is 1', () => {
    expect(labspaceOutcome(200, { result: 1, data: { results: [{ status: 'failed' }] } })).toEqual({ ok: false, code: 'STATUS_FAILED' });
    expect(labspaceOutcome(200, { result: 1, data: { sent: 0, failed: 1 } })).toEqual({ ok: false, code: 'NOT_SENT' });
  });

  it('passes through business error codes', () => {
    expect(labspaceOutcome(422, { result: 0, code: 'INSUFFICIENT_BALANCE', error: '...' })).toEqual({ ok: false, code: 'INSUFFICIENT_BALANCE' });
    expect(labspaceOutcome(429, { result: 0, code: 'RATE_LIMITED' })).toEqual({ ok: false, code: 'RATE_LIMITED' });
  });

  it('falls back to the HTTP status for non-JSON or unexpected bodies', () => {
    expect(labspaceOutcome(500, null)).toEqual({ ok: false, code: 'HTTP_500' });
    expect(labspaceOutcome(502, 'oops')).toEqual({ ok: false, code: 'HTTP_502' });
  });
});
