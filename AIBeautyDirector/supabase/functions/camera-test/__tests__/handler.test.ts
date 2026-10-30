/** @jest-environment node */
import { dermiqSample } from '../../_shared/adapters/__fixtures__/dermiq-sample';
import type { Dermiq } from '../../_shared/adapters/dermiq';
import { ScanError } from '../../_shared/codes';
import { handleCameraTest, type CameraTestDeps } from '../handler';

const uid = '11111111-2222-4333-8444-555555555555';
const path = `${uid}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;

function deps(overrides: Partial<CameraTestDeps> & { analyze?: Dermiq['analyze'] } = {}) {
  const calls = { downloaded: [] as string[], deleted: [] as string[], analyzed: 0 };
  const d: CameraTestDeps = {
    enabled: true,
    getUser: async (jwt) => (jwt === 'good' ? { id: uid } : null),
    downloadPhoto: async (p) => {
      calls.downloaded.push(p);
      return new Blob([new Uint8Array([1])]);
    },
    deletePhoto: async (p) => {
      calls.deleted.push(p);
    },
    dermiq: {
      modelVersion: 'test-model',
      analyze: overrides.analyze ?? (async () => {
        calls.analyzed++;
        return dermiqSample;
      }),
    },
    ...overrides,
  };
  return { d, calls };
}
const ok = { jwt: 'good', body: { image_path: path } };

describe('handleCameraTest', () => {
  it('refuses when not enabled, before touching auth or storage', async () => {
    const { d, calls } = deps({ enabled: false });
    expect(await handleCameraTest(ok, d)).toEqual({ status: 403, body: { error: 'disabled' } });
    expect(calls.downloaded).toEqual([]);
  });

  it('requires a real user', async () => {
    const { d } = deps();
    expect(await handleCameraTest({ jwt: null, body: ok.body }, d)).toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(await handleCameraTest({ jwt: 'anon', body: ok.body }, d)).toEqual({ status: 401, body: { error: 'unauthorized' } });
  });

  it('rejects paths outside the caller folder or not matching the naming rule, without downloading or deleting', async () => {
    const { d, calls } = deps();
    for (const bad of [
      `other-user/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`,
      `${uid}/../x.jpg`,
      `${uid}/photo.jpg`,
      `${uid}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png`,
      undefined,
      42,
    ]) {
      expect(await handleCameraTest({ jwt: 'good', body: { image_path: bad } }, d)).toEqual({ status: 400, body: { error: 'invalid_path' } });
    }
    expect(calls.downloaded).toEqual([]);
    expect(calls.deleted).toEqual([]);
  });

  it('returns raw + normalized on success and deletes the photo; never writes anywhere', async () => {
    const { d, calls } = deps();
    const res = await handleCameraTest(ok, d);
    expect(res.status).toBe(200);
    const body = res.body as { raw: unknown; normalized: { ok: boolean }; model_version: string; elapsed_ms: number };
    expect(body.raw).toEqual(dermiqSample);
    expect(body.normalized.ok).toBe(true);
    expect(body.model_version).toBe('test-model');
    expect(calls.downloaded).toEqual([path]);
    expect(calls.deleted).toEqual([path]);
    expect(calls.analyzed).toBe(1);
  });

  it('reports an invalid DermIQ result as a 200 with normalized.ok = false (dev tool), photo deleted', async () => {
    const { d, calls } = deps({ analyze: async () => ({ ...dermiqSample, status: 'failed' }) });
    const res = await handleCameraTest(ok, d);
    expect(res.status).toBe(200);
    expect((res.body as { normalized: unknown }).normalized).toEqual({ ok: false, code: 'invalid_result', reason: 'status_failed' });
    expect(calls.deleted).toEqual([path]);
  });

  it('404 when the photo is missing, still attempts the delete', async () => {
    const { d, calls } = deps({ downloadPhoto: async () => null });
    expect(await handleCameraTest(ok, d)).toEqual({ status: 404, body: { error: 'photo_missing' } });
    expect(calls.deleted).toEqual([path]);
  });

  it('maps provider errors to their status and code and still deletes the photo', async () => {
    for (const [code, status] of [['provider_credits', 502], ['provider_timeout', 504], ['image_too_large', 413]] as const) {
      const { d, calls } = deps({ analyze: async () => { throw new ScanError(code, status); } });
      expect(await handleCameraTest(ok, d)).toEqual({ status, body: { error: code } });
      expect(calls.deleted).toEqual([path]);
    }
  });

  it('survives a failing delete and an unknown error', async () => {
    const { d } = deps({ analyze: async () => { throw new Error('boom'); }, deletePhoto: async () => { throw new Error('storage'); } });
    expect(await handleCameraTest(ok, d)).toEqual({ status: 500, body: { error: 'provider_failed' } });
  });
});

describe('handleCameraTest logRaw', () => {
  it('logs the raw result only when logRaw is set', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await handleCameraTest(ok, deps().d);
      expect(log).not.toHaveBeenCalled();
      await handleCameraTest(ok, deps({ logRaw: true }).d);
      expect(log).toHaveBeenCalledWith(expect.stringContaining(`"id":"${dermiqSample.id}"`));
    } finally {
      log.mockRestore();
    }
  });
});
