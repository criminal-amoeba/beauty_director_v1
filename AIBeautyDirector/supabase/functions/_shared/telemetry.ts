// Dev counters for the LLM paths, per function instance (Edge Function instances are short-lived, so these
// are a cheap view of the fallback / cut-off / safety rates, printed in each request's final log line).
export type TallyKey = 'ok' | 'fallback' | 'empty' | 'length' | 'provider' | 'safety';

const counts: Record<Exclude<TallyKey, 'safety'>, number> = { ok: 0, fallback: 0, empty: 0, length: 0, provider: 0 };
const safety = new Map<string, number>();

export function tally(key: TallyKey, detail?: string): void {
  if (key === 'safety') safety.set(detail ?? '?', (safety.get(detail ?? '?') ?? 0) + 1);
  else counts[key]++;
}

export function tallyLine(): string {
  const base = (Object.keys(counts) as (keyof typeof counts)[]).map((k) => `${k}=${counts[k]}`).join(' ');
  return `${base} safety=${[...safety].map(([id, n]) => `${id}:${n}`).join(',')}`;
}

export function resetTally(): void {
  for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] = 0;
  safety.clear();
}

// Which counter a failed LLM call belongs to.
export const llmFailureKey = (e: unknown): TallyKey => {
  const detail = (e as { detail?: unknown })?.detail;
  return detail === 'length' ? 'length' : detail === 'empty' ? 'empty' : 'provider';
};
