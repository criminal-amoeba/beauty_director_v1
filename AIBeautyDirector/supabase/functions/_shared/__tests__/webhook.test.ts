/** @jest-environment node */
import { createHmac } from 'node:crypto';
import { verifyWebhook } from '../webhook';

// Signatures made with Node's HMAC, independent of the WebCrypto code under test.
const rawKey = Buffer.from('a-32-byte-test-secret-0123456789').toString('base64');
const secret = `v1,whsec_${rawKey}`;
const now = 1_700_000_000;
const body = JSON.stringify({ user: { phone: '886912345678' }, sms: { otp: '123456' } });
const sign = (id: string, ts: number, payload: string, key = rawKey) =>
  `v1,${createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${ts}.${payload}`).digest('base64')}`;
const headers = (signature: string, ts = now, id = 'msg_1') =>
  new Headers({ 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': signature });

describe('verifyWebhook', () => {
  it('accepts a valid signature', async () => {
    expect(await verifyWebhook(secret, headers(sign('msg_1', now, body)), body, now)).toBe(true);
  });

  it('accepts the secret without the v1,whsec_ prefix', async () => {
    expect(await verifyWebhook(rawKey, headers(sign('msg_1', now, body)), body, now)).toBe(true);
  });

  it('accepts when any one of several signatures matches (key rotation)', async () => {
    const other = sign('msg_1', now, body, Buffer.from('another-secret').toString('base64'));
    expect(await verifyWebhook(secret, headers(`${other} ${sign('msg_1', now, body)}`), body, now)).toBe(true);
  });

  it('rejects a tampered body, id or timestamp', async () => {
    const sig = sign('msg_1', now, body);
    expect(await verifyWebhook(secret, headers(sig), body.replace('123456', '000000'), now)).toBe(false);
    expect(await verifyWebhook(secret, headers(sig, now, 'msg_2'), body, now)).toBe(false);
    expect(await verifyWebhook(secret, headers(sig, now + 1), body, now)).toBe(false);
  });

  it('rejects a signature made with another secret', async () => {
    const sig = sign('msg_1', now, body, Buffer.from('wrong-secret').toString('base64'));
    expect(await verifyWebhook(secret, headers(sig), body, now)).toBe(false);
  });

  it('rejects timestamps outside the 5-minute window', async () => {
    const old = now - 301;
    const future = now + 301;
    expect(await verifyWebhook(secret, headers(sign('msg_1', old, body), old), body, now)).toBe(false);
    expect(await verifyWebhook(secret, headers(sign('msg_1', future, body), future), body, now)).toBe(false);
    const edge = now - 300;
    expect(await verifyWebhook(secret, headers(sign('msg_1', edge, body), edge), body, now)).toBe(true);
  });

  it('rejects missing headers, an empty secret, other versions and malformed signatures', async () => {
    const sig = sign('msg_1', now, body);
    expect(await verifyWebhook(secret, new Headers({ 'webhook-id': 'msg_1', 'webhook-signature': sig }), body, now)).toBe(false);
    expect(await verifyWebhook('', headers(sig), body, now)).toBe(false);
    expect(await verifyWebhook(secret, headers(sig.replace('v1,', 'v2,')), body, now)).toBe(false);
    expect(await verifyWebhook(secret, headers('v1,not*base64'), body, now)).toBe(false);
    expect(await verifyWebhook(secret, headers('garbage'), body, now)).toBe(false);
  });
});
