// Weekly scan pipeline (plan §1): auth → consent → path → stale sweep + 7-day gate → pending row → photo →
// DermIQ → normalize → metrics → context → rules → LLM (safety-checked, template fallback) → thread →
// succeeded. A week is only consumed by a `succeeded` row; every failure marks the row failed and the photo
// is deleted in every path (plan §9 Q3: nothing reads it after the run).
import type { Dermiq } from '../_shared/adapters/dermiq.ts';
import { normalizeResult } from '../_shared/adapters/dermiq-normalize.ts';
import type { Llm } from '../_shared/adapters/llm.ts';
import {
  CAPTURE_PROTOCOL_VERSION,
  isDue,
  isOwnImagePath,
  METRIC_DEFINITION_VERSION,
  PROVIDER,
  SCAN_INTERVAL_MS,
  ScanError,
  toLocale,
  type ErrorCode,
  type Locale,
} from '../_shared/codes.ts';
import { buildSystemPrompt, buildUserMessage, toPersona } from '../_shared/persona.ts';
import { comparable } from '../_shared/rules/goals.ts';
import { review, type ApprovedReview } from '../_shared/rules/review.ts';
import { checkReply } from '../_shared/safety/check.ts';
import { llmFailureKey, tally, tallyLine } from '../_shared/telemetry.ts';
import type { ReviewMessage, ScanDb } from '../_shared/scan-db.ts';
import { fallbackReview } from '../_shared/templates.ts';

export type WeeklyScanDeps = {
  getUser(jwt: string): Promise<{ id: string } | null>;
  downloadPhoto(path: string): Promise<Blob | null>;
  deletePhoto(path: string): Promise<void>;
  db: ScanDb;
  dermiq: Dermiq;
  llm: Llm;
  now?: () => number;
  deadlineMs?: number;
};

export type HandlerResult = { status: number; body: unknown };
const STALE_MS = 5 * 60 * 1000;
const LLM_MAX_TOKENS = 4000; // max_completion_tokens includes reasoning (medium effort); same budget as chat text
const MAX_MESSAGE_CHARS = 4000; // chat_messages.content check

const fail = (status: number, code: string, extra: Record<string, unknown> = {}): HandlerResult => ({
  status,
  body: { error: code, ...extra },
});

export async function handleWeeklyScan(req: { jwt: string | null; body: unknown }, deps: WeeklyScanDeps): Promise<HandlerResult> {
  const now = deps.now ?? Date.now;
  if (!req.jwt) return fail(401, 'unauthorized');
  const user = await deps.getUser(req.jwt);
  if (!user) return fail(401, 'unauthorized');

  const path = (req.body as { image_path?: unknown } | null)?.image_path;
  if (!isOwnImagePath(user.id, path)) return fail(400, 'invalid_path');

  const { db } = deps;
  try {
    if (!(await db.hasPhotoConsent(user.id))) return fail(403, 'consent_required');

    for (const stale of await db.sweepStale(user.id, new Date(now() - STALE_MS).toISOString())) {
      await deps.deletePhoto(stale).catch(() => console.error('run-weekly-scan: stale photo delete failed'));
    }
    const last = await db.lastSucceededAt(user.id);
    if (!isDue(last, now())) {
      return fail(409, 'not_due', { next_at: new Date(Date.parse(last!) + SCAN_INTERVAL_MS).toISOString() });
    }
    const pending = await db.insertPending({ user_id: user.id, provider: PROVIDER, capture_protocol_version: CAPTURE_PROTOCOL_VERSION, image_path: path });
    if (pending === 'in_progress') return fail(409, 'scan_in_progress');

    return await runScan(pending.id, user.id, path, deps);
  } catch (e) {
    const code = e instanceof ScanError ? e.code : 'db_failed';
    console.error(`run-weekly-scan: ${code}`);
    return fail(e instanceof ScanError ? e.status : 500, code);
  } finally {
    await deps.deletePhoto(path).catch(() => console.error('run-weekly-scan: photo delete failed'));
  }
}

// Everything after the pending row exists: any throw marks the row failed with the error's code.
async function runScan(scanId: string, userId: string, path: string, deps: WeeklyScanDeps): Promise<HandlerResult> {
  const { db } = deps;
  const signal = AbortSignal.timeout(deps.deadlineMs ?? 60_000);
  const started = Date.now();
  let metricsStored = false;
  try {
    const photo = await deps.downloadPhoto(path);
    if (!photo) throw new ScanError('photo_missing', 404);

    const raw = await deps.dermiq.analyze(photo, signal);
    const normalized = normalizeResult(raw);
    if (!normalized.ok) {
      // keep the raw payload for debugging, then fail
      await db.markProcessing(scanId, { provider_job_id: '', provider_raw: raw, provider_model_version: deps.dermiq.modelVersion });
      throw new ScanError('invalid_result', 502, normalized.reason);
    }
    await db.markProcessing(scanId, { provider_job_id: normalized.jobId, provider_raw: normalized.raw, provider_model_version: deps.dermiq.modelVersion });
    await db.insertMetrics(scanId, userId, normalized.metrics);
    metricsStored = true;

    const ctx = await db.loadContext(userId);
    const mine = { provider: PROVIDER, provider_model_version: deps.dermiq.modelVersion, capture_protocol_version: CAPTURE_PROTOCOL_VERSION, metric_definition_version: METRIC_DEFINITION_VERSION };
    const previous = ctx.previous && comparable(mine, ctx.previous) ? ctx.previous.metrics : null;
    const approved = review({
      metrics: normalized.metrics,
      previous,
      goals: ctx.goals,
      budget: ctx.budget,
      reactions: ctx.reactions,
      ownedCategories: ctx.ownedCategories,
      routineSteps: ctx.routineSteps,
    });

    const locale = toLocale(ctx.locale);
    const message = await writeReview(approved, { persona: toPersona(ctx.persona), locale, firstScan: ctx.previous === null }, deps.llm, signal);
    const { threadId } = await db.insertReview(scanId, userId, message);
    await db.markSucceeded(scanId);
    console.log(`run-weekly-scan: succeeded scan=${scanId} job=${normalized.jobId} model=${message.model ?? 'template'} tokens=${message.promptTokens ?? '-'}/${message.completionTokens ?? '-'} ms=${Date.now() - started} tally=${tallyLine()}`);
    return { status: 200, body: { scan_id: scanId, thread_id: threadId } };
  } catch (e) {
    const code: ErrorCode = e instanceof ScanError ? e.code : 'db_failed';
    console.error(`run-weekly-scan: failed scan=${scanId} code=${code}`);
    if (metricsStored) await db.deleteMetrics(scanId).catch(() => console.error('run-weekly-scan: metrics delete failed'));
    await db.markFailed(scanId, code).catch(() => console.error('run-weekly-scan: markFailed failed'));
    return fail(e instanceof ScanError ? e.status : 500, code);
  }
}

// LLM phrasing of the approved review: safety-checked, one stricter retry, else the locale template.
// The LLM never changes what is recommended, only how it is said; its failure never fails the scan.
export async function writeReview(
  approved: ApprovedReview,
  opts: { persona: ReturnType<typeof toPersona>; locale: Locale; firstScan: boolean },
  llm: Llm,
  signal: AbortSignal,
): Promise<ReviewMessage> {
  const user = buildUserMessage(approved, opts.firstScan);
  for (const stricter of [false, true]) {
    try {
      const res = await llm.complete({ system: buildSystemPrompt({ ...opts, stricter }), user, maxTokens: LLM_MAX_TOKENS, locale: opts.locale, signal });
      const safety = checkReply(res.text);
      if (safety.ok && res.text.length <= MAX_MESSAGE_CHARS) {
        tally('ok');
        return { content: res.text, model: res.model, promptTokens: res.promptTokens, completionTokens: res.completionTokens };
      }
      for (const h of safety.hits) tally('safety', h);
      console.warn(`run-weekly-scan: review rejected reason=${safety.ok ? 'too_long' : `safety hits=${safety.hits.join(',')}`} stricter=${stricter}`);
    } catch (e) {
      tally(llmFailureKey(e));
      console.warn(`run-weekly-scan: review rejected reason=${e instanceof ScanError ? `${e.code}${e.detail ? ` ${e.detail}` : ''}` : (e as Error).name} stricter=${stricter}`);
      if (signal.aborted) break;
    }
  }
  tally('fallback');
  return { content: fallbackReview(approved, opts.locale), model: null, promptTokens: null, completionTokens: null };
}
