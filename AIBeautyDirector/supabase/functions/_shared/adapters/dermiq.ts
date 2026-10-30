// DermIQ provider adapter: auth, submit, polling, error mapping. Nothing outside adapters knows the vendor.
// Mock mode returns the documented sample so the whole pipeline runs without spending credits.
import { ScanError } from '../codes.ts';
import { dermiqSample } from './__fixtures__/dermiq-sample.ts';

export type DermiqEnv = {
  mode: 'mock' | 'real';
  apiUrl: string;
  apiKey: string;
  endpoint: 'quick' | 'full';
  modelVersion: string;
  pollIntervalMs: number;
  maxPolls: number;
};

// Reads DERMIQ_* secrets. Polling: 1.5 s × 20 = 30 s max (docs: 1.5–2.5 s typical).
export function dermiqEnvFrom(get: (key: string) => string | undefined): DermiqEnv {
  return {
    mode: get('DERMIQ_MODE') === 'real' ? 'real' : 'mock',
    // shortcut: falls back to the legacy DERMICQ_* secrets on dev, drop once they are deleted (plan §9 Q9)
    apiUrl: (get('DERMIQ_API_URL') ?? get('DERMICQ_API_URL') ?? 'https://dev.dermiq.cloud').replace(/\/$/, ''),
    apiKey: get('DERMIQ_API_KEY') ?? get('DERMICQ_API_KEY') ?? '',
    endpoint: get('DERMIQ_ENDPOINT') === 'full' ? 'full' : 'quick',
    modelVersion: get('DERMIQ_MODEL_VERSION') ?? 'dermiq-dev-2026-10', // DermIQ documents no version field (plan §9 Q5)
    pollIntervalMs: 1500,
    maxPolls: 20,
  };
}

export type Dermiq = {
  modelVersion: string;
  // Resolves to the raw provider result (validated by normalizeResult); throws ScanError with a provider_* code.
  analyze(image: Blob, signal: AbortSignal): Promise<unknown>;
};

type Fetch = typeof fetch;
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

const defaultSleep: Sleep = (ms, signal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new ScanError('provider_timeout', 504));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ScanError('provider_timeout', 504));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });

function mapHttp(status: number): ScanError {
  if (status === 401) return new ScanError('provider_auth', 502);
  if (status === 403) return new ScanError('provider_credits', 502);
  if (status === 413) return new ScanError('image_too_large', 413);
  if (status === 429) return new ScanError('provider_rate_limited', 429);
  return new ScanError('provider_failed', 502, { status });
}

export function createDermiq(env: DermiqEnv, fetchFn: Fetch = fetch, sleep: Sleep = defaultSleep): Dermiq {
  if (env.mode === 'mock') {
    return {
      modelVersion: env.modelVersion,
      analyze: async () => ({ ...dermiqSample, id: `mock-${crypto.randomUUID()}` }),
    };
  }
  if (!env.apiKey) throw new ScanError('provider_auth', 500, 'DERMIQ_API_KEY missing');

  const request = async (url: string, init: RequestInit, signal: AbortSignal) => {
    try {
      return await fetchFn(url, { ...init, headers: { Authorization: `Bearer ${env.apiKey}` }, signal });
    } catch (e) {
      if (signal.aborted) throw new ScanError('provider_timeout', 504);
      throw new ScanError('provider_failed', 502, (e as Error).name);
    }
  };

  return {
    modelVersion: env.modelVersion,
    async analyze(image, signal) {
      const form = new FormData();
      form.append('file', image, 'face.jpg');
      const path = env.endpoint === 'quick' ? '/v1/analyze/quick' : '/v1/analyze';
      const submitted = await request(`${env.apiUrl}${path}`, { method: 'POST', body: form }, signal);
      if (!submitted.ok) throw mapHttp(submitted.status);
      const job = (await submitted.json().catch(() => null)) as { analysis_id?: unknown } | null;
      const id = job?.analysis_id;
      if (typeof id !== 'string' || !id) throw new ScanError('provider_failed', 502, 'no_analysis_id');

      for (let i = 0; i < env.maxPolls; i++) {
        await sleep(env.pollIntervalMs, signal);
        const res = await request(`${env.apiUrl}/v1/results/${encodeURIComponent(id)}`, { method: 'GET' }, signal);
        if (res.status === 404) continue; // job not visible yet
        if (!res.ok) throw mapHttp(res.status);
        const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
        if (body?.status === 'completed') return body;
        if (body?.status === 'failed') throw new ScanError('provider_failed', 502, 'job_failed');
      }
      throw new ScanError('provider_timeout', 504, { id });
    },
  };
}
