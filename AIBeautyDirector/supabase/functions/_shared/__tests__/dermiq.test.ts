/** @jest-environment node */
import { dermiqSample } from '../adapters/__fixtures__/dermiq-sample';
import { createDermiq, dermiqEnvFrom, type DermiqEnv } from '../adapters/dermiq';
import { ScanError } from '../codes';

const env: DermiqEnv = {
  mode: 'real',
  apiUrl: 'https://dermiq.test',
  apiKey: 'diq_sk_test',
  endpoint: 'quick',
  modelVersion: 'test-model',
  pollIntervalMs: 0,
  maxPolls: 3,
};
const noSleep = async () => {};
const image = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Scripted fetch: one response per call, in order; records every request.
function scripted(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('no scripted response left');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchFn, calls };
}

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof ScanError ? e.code : `other:${String(e)}`;
  }
};

describe('dermiqEnvFrom', () => {
  it('defaults to mock mode, quick endpoint and the documented base URL', () => {
    const e = dermiqEnvFrom(() => undefined);
    expect(e).toMatchObject({ mode: 'mock', endpoint: 'quick', apiUrl: 'https://dev.dermiq.cloud', pollIntervalMs: 1500, maxPolls: 20 });
    expect(e.modelVersion.length).toBeGreaterThan(0);
  });
  it('reads real mode and strips a trailing slash', () => {
    const e = dermiqEnvFrom((k) => ({ DERMIQ_MODE: 'real', DERMIQ_API_URL: 'https://x.test/', DERMIQ_API_KEY: 'k', DERMIQ_ENDPOINT: 'full' })[k]);
    expect(e).toMatchObject({ mode: 'real', apiUrl: 'https://x.test', endpoint: 'full', apiKey: 'k' });
  });
});

describe('createDermiq mock mode', () => {
  it('returns the sample with a fresh mock id and never fetches', async () => {
    const { fetchFn, calls } = scripted([]);
    const d = createDermiq({ ...env, mode: 'mock' }, fetchFn, noSleep);
    const res = (await d.analyze(image, new AbortController().signal)) as { id: string; status: string };
    expect(res.status).toBe('completed');
    expect(res.id).toMatch(/^mock-/);
    expect(calls).toHaveLength(0);
  });
});

describe('createDermiq real mode', () => {
  it('refuses to start without an API key', () => {
    expect(() => createDermiq({ ...env, apiKey: '' })).toThrow(ScanError);
  });

  it('submits multipart with the bearer key, polls until completed', async () => {
    const { fetchFn, calls } = scripted([
      json(202, { analysis_id: 'job-1', status: 'pending' }),
      json(200, { id: 'job-1', status: 'processing' }),
      json(200, dermiqSample),
    ]);
    const d = createDermiq(env, fetchFn, noSleep);
    const res = await d.analyze(image, new AbortController().signal);
    expect(res).toEqual(dermiqSample);
    expect(calls[0].url).toBe('https://dermiq.test/v1/analyze/quick');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer diq_sk_test');
    expect(calls[0].init.body).toBeInstanceOf(FormData);
    expect((calls[0].init.body as FormData).get('file')).toBeInstanceOf(Blob);
    expect(calls[1].url).toBe('https://dermiq.test/v1/results/job-1');
    expect(calls).toHaveLength(3);
  });

  it('uses the full endpoint when configured', async () => {
    const { fetchFn, calls } = scripted([json(202, { analysis_id: 'j' }), json(200, dermiqSample)]);
    await createDermiq({ ...env, endpoint: 'full' }, fetchFn, noSleep).analyze(image, new AbortController().signal);
    expect(calls[0].url).toBe('https://dermiq.test/v1/analyze');
  });

  it.each([
    [401, 'provider_auth'],
    [403, 'provider_credits'],
    [413, 'image_too_large'],
    [429, 'provider_rate_limited'],
    [500, 'provider_failed'],
  ])('maps submit HTTP %i to %s', async (status, expected) => {
    const { fetchFn } = scripted([json(status, { error: 'x' })]);
    expect(await code(createDermiq(env, fetchFn, noSleep).analyze(image, new AbortController().signal))).toBe(expected);
  });

  it('fails when the submit reply has no analysis_id', async () => {
    const { fetchFn } = scripted([json(202, { status: 'pending' })]);
    expect(await code(createDermiq(env, fetchFn, noSleep).analyze(image, new AbortController().signal))).toBe('provider_failed');
  });

  it('fails when the job reports failed', async () => {
    const { fetchFn } = scripted([json(202, { analysis_id: 'j' }), json(200, { id: 'j', status: 'failed' })]);
    expect(await code(createDermiq(env, fetchFn, noSleep).analyze(image, new AbortController().signal))).toBe('provider_failed');
  });

  it('times out after maxPolls while still pending (404 counts as not visible yet)', async () => {
    const { fetchFn, calls } = scripted([
      json(202, { analysis_id: 'j' }),
      json(404, {}),
      json(200, { status: 'pending' }),
      json(200, { status: 'processing' }),
      json(200, dermiqSample), // never reached: maxPolls = 3
    ]);
    expect(await code(createDermiq(env, fetchFn, noSleep).analyze(image, new AbortController().signal))).toBe('provider_timeout');
    expect(calls).toHaveLength(4);
  });

  it('maps a network failure to provider_failed and an aborted signal to provider_timeout', async () => {
    const net = scripted([new TypeError('fetch failed')]);
    expect(await code(createDermiq(env, net.fetchFn, noSleep).analyze(image, new AbortController().signal))).toBe('provider_failed');

    const ac = new AbortController();
    ac.abort();
    const aborted = scripted([new DOMException('aborted', 'AbortError')]);
    expect(await code(createDermiq(env, aborted.fetchFn, noSleep).analyze(image, ac.signal))).toBe('provider_timeout');
  });
});
