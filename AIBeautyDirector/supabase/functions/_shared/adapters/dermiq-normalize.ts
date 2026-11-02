// DermIQ result → internal metrics. Paths come from a real /quick result (docs/dermiq/sample-result.json);
// the api-docs shape was wrong (acne/pore/texture nest under `whole`, dark circle is singular).
// Scores are 0–100, higher = healthier, kept as-is under vendor-neutral codes.
import { METRIC_DEFINITION_VERSION, type Metric, type MetricCode } from '../codes.ts';

type Path = readonly string[];
export const REQUIRED_METRICS: Readonly<Record<string, Path>> = {
  breakout_visibility: ['hd_acne', 'whole', 'ui_score'],
  wrinkle_visibility: ['hd_wrinkle', 'whole', 'ui_score'],
  pore_visibility: ['hd_pore', 'whole', 'ui_score'],
  redness_appearance: ['hd_redness', 'ui_score'],
  oiliness_balance: ['hd_oiliness', 'ui_score'],
  texture_smoothness: ['hd_texture', 'whole', 'ui_score'],
  dark_circle_visibility: ['hd_dark_circle', 'ui_score'],
  firmness_appearance: ['hd_firmness', 'ui_score'],
};
// Optional: stored when present and not flagged unreliable by the provider (missing never fails a scan).
export const OPTIONAL_METRICS: Readonly<Record<string, Path>> = {
  hydration_balance: ['hd_moisture', 'ui_score'],
  wrinkle_forehead: ['hd_wrinkle', 'forehead', 'ui_score'],
  wrinkle_crow_feet: ['hd_wrinkle', 'crowfeet', 'ui_score'],
  wrinkle_nasolabial: ['hd_wrinkle', 'nasolabial', 'ui_score'],
};

export type Normalized =
  | { ok: true; jobId: string; metrics: Metric[]; raw: Record<string, unknown> }
  | { ok: false; code: 'invalid_result'; reason: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function dig(obj: unknown, path: Path): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

const score = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v * 10) / 10 : null;

// What we keep of the vendor payload (data minimisation): the hd_* blocks, skin tone (comparability),
// job id, analysis type and timing. Never appearance attributes (eye/lip/hair colour, face shape).
// all.score / skin_age are dropped unless keepScores (plan §9 Q6).
export function minimiseRaw(result: Record<string, unknown>, keepScores = false): Record<string, unknown> {
  const rj = isRecord(result.result_json) ? result.result_json : {};
  const kept: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rj)) if (k.startsWith('hd_') || k === 'skin_tone') kept[k] = v;
  if (keepScores) {
    if ('all' in rj) kept.all = rj.all;
    if ('skin_age' in rj) kept.skin_age = rj.skin_age;
  }
  return {
    id: result.id,
    analysis_type: result.analysis_type,
    processing_time_ms: result.processing_time_ms,
    result_json: kept,
  };
}

export function normalizeResult(result: unknown, keepScores = false): Normalized {
  if (!isRecord(result)) return { ok: false, code: 'invalid_result', reason: 'not_an_object' };
  if (result.status !== 'completed') return { ok: false, code: 'invalid_result', reason: `status_${String(result.status)}` };
  if (typeof result.id !== 'string' || !result.id) return { ok: false, code: 'invalid_result', reason: 'missing_id' };
  const rj = result.result_json;
  if (!isRecord(rj)) return { ok: false, code: 'invalid_result', reason: 'missing_result_json' };

  const metrics: Metric[] = [];
  for (const [code, path] of Object.entries(REQUIRED_METRICS)) {
    const value = score(dig(rj, path));
    if (value === null) return { ok: false, code: 'invalid_result', reason: `missing_${code}` };
    metrics.push({ metric_code: code as MetricCode, value, metric_definition_version: METRIC_DEFINITION_VERSION });
  }
  for (const [code, path] of Object.entries(OPTIONAL_METRICS)) {
    const block = dig(rj, path.slice(0, -1));
    if (isRecord(block) && (block.reliability === 'unreliable' || block.display === false)) continue;
    const value = score(dig(rj, path));
    if (value !== null) metrics.push({ metric_code: code as MetricCode, value, metric_definition_version: METRIC_DEFINITION_VERSION });
  }
  return { ok: true, jobId: result.id, metrics, raw: minimiseRaw(result, keepScores) };
}
