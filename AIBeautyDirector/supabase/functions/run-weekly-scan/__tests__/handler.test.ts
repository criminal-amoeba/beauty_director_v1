/** @jest-environment node */
import { dermiqSample } from '../../_shared/adapters/__fixtures__/dermiq-sample';
import type { Dermiq } from '../../_shared/adapters/dermiq';
import { createLlm, llmEnvFrom, MOCK_REVIEW, type Llm } from '../../_shared/adapters/llm';
import { ScanError, type Metric } from '../../_shared/codes';
import type { ScanContext, ScanDb } from '../../_shared/scan-db';
import { FIRST_SCAN_NOTE } from '../../_shared/persona';
import { DISCLAIMER } from '../../_shared/templates';
import { handleWeeklyScan, type WeeklyScanDeps } from '../handler';

const uid = '11111111-2222-4333-8444-555555555555';
const path = `${uid}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.jpg`;
const NOW = Date.parse('2026-10-30T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const baseContext: ScanContext = {
  goals: ['hydration'],
  budget: 'mid',
  reactions: [],
  ownedCategories: [],
  routineSteps: { am: ['cleanse', 'moisturize', 'protect'], pm: ['cleanse', 'moisturize'] },
  persona: 'gentle',
  locale: 'en',
  previous: null,
};

type Fake = { db: ScanDb; log: string[]; scans: Record<string, { status: string; code?: string }>; metrics: Metric[]; messages: { content: string; model: string | null }[] };

function fakeDb(over: Partial<ScanDb> & { consent?: boolean; last?: string | null; stale?: string[]; context?: ScanContext } = {}): Fake {
  const log: string[] = [];
  const scans: Fake['scans'] = {};
  const metrics: Metric[] = [];
  const messages: Fake['messages'] = [];
  const db: ScanDb = {
    hasPhotoConsent: async () => over.consent ?? true,
    sweepStale: async () => {
      log.push('sweep');
      return over.stale ?? [];
    },
    lastSucceededAt: async () => over.last ?? null,
    insertPending: async () => {
      log.push('insert');
      scans.s1 = { status: 'pending' };
      return { id: 's1' };
    },
    markProcessing: async (id) => {
      log.push('processing');
      scans[id].status = 'processing';
    },
    insertMetrics: async (_id, _uid, m) => {
      log.push('metrics');
      metrics.push(...m);
    },
    deleteMetrics: async () => {
      log.push('delete_metrics');
      metrics.length = 0;
    },
    loadContext: async () => over.context ?? baseContext,
    insertReview: async (_id, _uid, m) => {
      log.push('review');
      messages.push({ content: m.content, model: m.model });
      return { threadId: 't1' };
    },
    markSucceeded: async (id) => {
      log.push('succeeded');
      scans[id].status = 'succeeded';
    },
    markFailed: async (id, code) => {
      log.push(`failed:${code}`);
      scans[id] = { status: 'failed', code };
    },
    ...over,
  };
  return { db, log, scans, metrics, messages };
}

function deps(fake: Fake, over: Partial<WeeklyScanDeps> & { analyze?: Dermiq['analyze']; llm?: Llm } = {}) {
  const deleted: string[] = [];
  const d: WeeklyScanDeps = {
    getUser: async (jwt) => (jwt === 'good' ? { id: uid } : null),
    downloadPhoto: async () => new Blob([new Uint8Array([1])]),
    deletePhoto: async (p) => {
      deleted.push(p);
    },
    db: fake.db,
    dermiq: { modelVersion: 'm1', analyze: over.analyze ?? (async () => dermiqSample) },
    llm: over.llm ?? createLlm({ mode: 'mock', provider: '', apiKey: '', model: '' }),
    now: () => NOW,
    ...over,
  };
  return { d, deleted };
}
const ok = { jwt: 'good', body: { image_path: path } };
const silence = () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
};

describe('handleWeeklyScan: gates', () => {
  beforeEach(silence);
  afterEach(() => jest.restoreAllMocks());

  it('rejects a missing or bad jwt without touching the photo', async () => {
    const f = fakeDb();
    const { d, deleted } = deps(f);
    expect((await handleWeeklyScan({ jwt: null, body: ok.body }, d)).status).toBe(401);
    expect((await handleWeeklyScan({ jwt: 'bad', body: ok.body }, d)).status).toBe(401);
    expect(deleted).toEqual([]);
    expect(f.log).toEqual([]);
  });

  it('rejects a path outside the caller folder and never deletes it', async () => {
    const { d, deleted } = deps(fakeDb());
    const res = await handleWeeklyScan({ jwt: 'good', body: { image_path: `other-user/${path.split('/')[1]}` } }, d);
    expect(res).toEqual({ status: 400, body: { error: 'invalid_path' } });
    expect(deleted).toEqual([]);
  });

  it('requires photo consent, deletes the photo, writes no row', async () => {
    const f = fakeDb({ consent: false });
    const { d, deleted } = deps(f);
    expect(await handleWeeklyScan(ok, d)).toEqual({ status: 403, body: { error: 'consent_required' } });
    expect(deleted).toEqual([path]);
    expect(f.log).toEqual([]);
  });

  it('sweeps stale scans (deleting their photos) before the gate', async () => {
    const f = fakeDb({ stale: [`${uid}/old.jpg`] });
    const { d, deleted } = deps(f);
    await handleWeeklyScan(ok, d);
    expect(deleted).toEqual([`${uid}/old.jpg`, path]);
    expect(f.log[0]).toBe('sweep');
  });

  it('is not due within 7 days of a succeeded scan and reports next_at', async () => {
    const last = new Date(NOW - 3 * DAY).toISOString();
    const f = fakeDb({ last });
    const { d, deleted } = deps(f);
    const res = await handleWeeklyScan(ok, d);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_due', next_at: new Date(NOW + 4 * DAY).toISOString() });
    expect(deleted).toEqual([path]);
    expect(f.log).toEqual(['sweep']);
  });

  it('is due exactly 7 days after the last succeeded scan', async () => {
    const f = fakeDb({ last: new Date(NOW - 7 * DAY).toISOString() });
    expect((await handleWeeklyScan(ok, deps(f).d)).status).toBe(200);
  });

  it('reports an in-flight scan without touching it', async () => {
    const f = fakeDb({ insertPending: async () => 'in_progress' });
    const { d, deleted } = deps(f);
    expect(await handleWeeklyScan(ok, d)).toEqual({ status: 409, body: { error: 'scan_in_progress' } });
    expect(deleted).toEqual([path]);
    expect(f.log).toEqual(['sweep']);
  });

  it('maps a database error before the row exists to db_failed', async () => {
    const f = fakeDb({ hasPhotoConsent: async () => { throw new Error('pg'); } });
    expect(await handleWeeklyScan(ok, deps(f).d)).toEqual({ status: 500, body: { error: 'db_failed' } });
  });
});

describe('handleWeeklyScan: pipeline', () => {
  beforeEach(silence);
  afterEach(() => jest.restoreAllMocks());

  it('succeeds: rows in order, metrics stored, review from the LLM, photo deleted, 200 shape', async () => {
    const f = fakeDb();
    const { d, deleted } = deps(f);
    const res = await handleWeeklyScan(ok, d);
    expect(res).toEqual({ status: 200, body: { scan_id: 's1', thread_id: 't1' } });
    expect(f.log).toEqual(['sweep', 'insert', 'processing', 'metrics', 'review', 'succeeded']);
    expect(f.scans.s1.status).toBe('succeeded');
    expect(f.metrics.map((m) => m.metric_code)).toContain('hydration_balance');
    expect(f.messages).toEqual([{ content: MOCK_REVIEW.en, model: 'mock' }]);
    expect(deleted).toEqual([path]);
  });

  it('replies in the user locale', async () => {
    const f = fakeDb({ context: { ...baseContext, locale: 'zh-TW' } });
    await handleWeeklyScan(ok, deps(f).d);
    expect(f.messages[0].content).toBe(MOCK_REVIEW['zh-TW']);
  });

  it('fails photo_missing when the object is gone', async () => {
    const f = fakeDb();
    const { d } = deps(f, { downloadPhoto: async () => null });
    expect(await handleWeeklyScan(ok, d)).toEqual({ status: 404, body: { error: 'photo_missing' } });
    expect(f.scans.s1).toEqual({ status: 'failed', code: 'photo_missing' });
  });

  it('never saves an invalid DermIQ result as a success, keeps raw for debugging', async () => {
    const f = fakeDb();
    const { d } = deps(f, { analyze: async () => ({ ...dermiqSample, result_json: {} }) });
    expect(await handleWeeklyScan(ok, d)).toEqual({ status: 502, body: { error: 'invalid_result' } });
    expect(f.log).toEqual(['sweep', 'insert', 'processing', 'failed:invalid_result']);
    expect(f.metrics).toEqual([]);
  });

  it.each([
    ['provider_timeout', 504],
    ['provider_credits', 502],
    ['provider_failed', 502],
  ] as const)('marks the scan failed(%s) when DermIQ throws', async (code, status) => {
    const f = fakeDb();
    const { d, deleted } = deps(f, { analyze: async () => { throw new ScanError(code, status); } });
    expect(await handleWeeklyScan(ok, d)).toEqual({ status, body: { error: code } });
    expect(f.scans.s1).toEqual({ status: 'failed', code });
    expect(deleted).toEqual([path]);
  });

  it('removes stored metrics when a later step fails', async () => {
    const f = fakeDb({ loadContext: async () => { throw new Error('pg'); } });
    expect(await handleWeeklyScan(ok, deps(f).d)).toEqual({ status: 500, body: { error: 'db_failed' } });
    expect(f.log).toEqual(['sweep', 'insert', 'processing', 'metrics', 'delete_metrics', 'failed:db_failed']);
    expect(f.metrics).toEqual([]);
  });

  it('still succeeds with the locale template when the LLM fails', async () => {
    const f = fakeDb();
    const llm: Llm = { complete: async () => { throw new ScanError('provider_failed', 502); } };
    expect((await handleWeeklyScan(ok, deps(f, { llm }).d)).status).toBe(200);
    expect(f.messages[0].model).toBeNull();
    expect(f.messages[0].content).toContain('Here is your weekly check-in.');
    expect(f.messages[0].content).not.toContain(DISCLAIMER.en); // the chat screen shows it once
  });

  it('retries once with a stricter prompt after a forbidden reply, then falls back', async () => {
    const f = fakeDb();
    const systems: string[] = [];
    const llm: Llm = {
      complete: async (req) => {
        systems.push(req.system);
        return { text: 'You have rosacea; see a dermatologist for treatment.', model: 'x', promptTokens: 1, completionTokens: 1, reasoningTokens: null };
      },
    };
    await handleWeeklyScan(ok, deps(f, { llm }).d);
    expect(systems).toHaveLength(2);
    expect(systems[1]).toContain('forbidden wording');
    expect(f.messages[0].model).toBeNull();
  });

  it('compares with the previous scan only when versions match', async () => {
    const prevMetrics: Metric[] = [{ metric_code: 'redness_appearance', value: 50, metric_definition_version: 'v1' }];
    const same = { provider: 'dermiq', provider_model_version: 'm1', capture_protocol_version: 'cp1', metric_definition_version: 'v1', metrics: prevMetrics };
    const seen: string[] = [];
    const llm: Llm = {
      complete: async (req) => {
        seen.push(req.user);
        return { text: MOCK_REVIEW.en, model: 'x', promptTokens: null, completionTokens: null, reasoningTokens: null };
      },
    };
    await handleWeeklyScan(ok, deps(fakeDb({ context: { ...baseContext, previous: same } }), { llm }).d);
    await handleWeeklyScan(ok, deps(fakeDb({ context: { ...baseContext, previous: { ...same, provider_model_version: 'm0' } } }), { llm }).d);
    expect(seen[0]).toContain('"change": "better than last time"');
    expect(seen[1]).not.toContain('"change": "better');
    expect(seen[1]).toContain('"first_scan": false');
  });

  it('gives the review the same reasoning-inclusive budget as chat', async () => {
    const seen: number[] = [];
    const llm: Llm = {
      complete: async (req) => {
        seen.push(req.maxTokens);
        return { text: MOCK_REVIEW.en, model: 'x', promptTokens: null, completionTokens: null, reasoningTokens: null };
      },
    };
    await handleWeeklyScan(ok, deps(fakeDb(), { llm }).d);
    expect(seen[0]).toBeGreaterThanOrEqual(4000);
  });

  it('tells the Director it is a first scan only when there is no previous one', async () => {
    const systems: string[] = [];
    const llm: Llm = {
      complete: async (req) => {
        systems.push(req.system);
        return { text: MOCK_REVIEW.en, model: 'x', promptTokens: null, completionTokens: null, reasoningTokens: null };
      },
    };
    await handleWeeklyScan(ok, deps(fakeDb({ context: { ...baseContext, previous: null } }), { llm }).d);
    expect(systems[0]).toContain(FIRST_SCAN_NOTE);
    const prevMetrics: Metric[] = [{ metric_code: 'redness_appearance', value: 50, metric_definition_version: 'v1' }];
    const same = { provider: 'dermiq', provider_model_version: 'm1', capture_protocol_version: 'cp1', metric_definition_version: 'v1', metrics: prevMetrics };
    await handleWeeklyScan(ok, deps(fakeDb({ context: { ...baseContext, previous: same } }), { llm }).d);
    expect(systems[1]).not.toContain(FIRST_SCAN_NOTE);
  });
});

describe('createLlm (openai)', () => {
  const env = { mode: 'real' as const, provider: 'openai', apiKey: 'k', model: 'gpt-5-nano' };
  const req = { system: 's', user: 'u', maxTokens: 10, locale: 'en' as const, signal: new AbortController().signal };

  it('sends the documented request and maps the reply', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ model: 'gpt-5-nano', choices: [{ finish_reason: 'stop', message: { content: ' hi ' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }));
    }) as typeof fetch;
    const res = await createLlm(env, fetchFn).complete(req);
    expect(res).toEqual({ text: 'hi', model: 'gpt-5-nano', promptTokens: 3, completionTokens: 2, reasoningTokens: null });
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      model: 'gpt-5-nano',
      max_completion_tokens: 10,
      messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }],
    });
  });

  it('treats refusals, cut-offs and http errors as provider failures', async () => {
    const body = (b: unknown, status = 200) => (async () => new Response(JSON.stringify(b), { status })) as typeof fetch;
    const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as ScanError).code);
    expect(await code(createLlm(env, body({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] })).complete(req))).toBe('provider_failed');
    expect(await code(createLlm(env, body({ choices: [{ finish_reason: 'length', message: { content: 'x' } }] })).complete(req))).toBe('provider_failed');
    expect(await code(createLlm(env, body({}, 500)).complete(req))).toBe('provider_failed');
  });

  it('falls back to the CHATGPT_KEY secret', () => {
    const get = (k: string) => ({ LLM_MODE: 'real', CHATGPT_KEY: 'c' } as Record<string, string>)[k];
    expect(llmEnvFrom(get)).toMatchObject({ mode: 'real', provider: 'openai', apiKey: 'c', model: 'gpt-5-nano' });
  });

  it('refuses to start without a key or with an unknown provider', () => {
    expect(() => createLlm({ ...env, apiKey: '' })).toThrow(ScanError);
    expect(() => createLlm({ ...env, provider: 'other' })).toThrow(ScanError);
  });
});
