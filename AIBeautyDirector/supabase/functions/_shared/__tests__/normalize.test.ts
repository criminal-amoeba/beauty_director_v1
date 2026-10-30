/** @jest-environment node */
import { dermiqSample } from '../adapters/__fixtures__/dermiq-sample';
import { minimiseRaw, normalizeResult } from '../adapters/dermiq-normalize';
import { CORE_METRIC_CODES, isDue, SCAN_INTERVAL_MS } from '../codes';

const clone = () => JSON.parse(JSON.stringify(dermiqSample)) as typeof dermiqSample & Record<string, unknown>;

describe('normalizeResult', () => {
  it('maps the real quick sample to the 8 core metrics plus the wrinkle areas present', () => {
    const res = normalizeResult(dermiqSample);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.jobId).toBe(dermiqSample.id);
    const codes = res.metrics.map((m) => m.metric_code);
    for (const c of CORE_METRIC_CODES) expect(codes).toContain(c);
    expect(codes).toEqual(expect.arrayContaining(['wrinkle_forehead', 'wrinkle_crow_feet', 'wrinkle_nasolabial']));
    expect(codes).not.toContain('wrinkle_glabellar'); // areas without a metric code are simply not stored
    expect(res.metrics.find((m) => m.metric_code === 'hydration_balance')?.value).toBe(63);
    expect(res.metrics.find((m) => m.metric_code === 'breakout_visibility')?.value).toBe(96);
    expect(res.metrics.find((m) => m.metric_code === 'wrinkle_visibility')?.value).toBe(83);
    expect(res.metrics.find((m) => m.metric_code === 'dark_circle_visibility')?.value).toBe(72);
    expect(res.metrics.every((m) => m.metric_definition_version === 'v1')).toBe(true);
  });

  it('never stores skin_age, overall score or appearance attributes as metrics', () => {
    const res = normalizeResult(dermiqSample);
    if (!res.ok) throw new Error('expected ok');
    const codes = res.metrics.map((m) => m.metric_code) as string[];
    expect(codes.some((c) => /age|score|color|shape|tone/.test(c))).toBe(false);
  });

  it('skips optional areas the provider flags unreliable, but never core metrics', () => {
    const r = clone();
    (r.result_json.hd_moisture as Record<string, unknown>).reliability = 'unreliable';
    (r.result_json.hd_wrinkle.crowfeet as Record<string, unknown>).display = false;
    (r.result_json.hd_acne.whole as Record<string, unknown>).reliability = 'unreliable';
    const res = normalizeResult(r);
    if (!res.ok) throw new Error('expected ok');
    const codes = res.metrics.map((m) => m.metric_code);
    expect(codes).not.toContain('hydration_balance');
    expect(codes).not.toContain('wrinkle_crow_feet');
    expect(codes).toContain('breakout_visibility');
    const r2 = clone();
    delete (r2.result_json as Record<string, unknown>).hd_moisture;
    expect(normalizeResult(r2).ok).toBe(true);
  });

  it('rejects a job that is not completed', () => {
    expect(normalizeResult({ ...clone(), status: 'processing' })).toEqual({ ok: false, code: 'invalid_result', reason: 'status_processing' });
    expect(normalizeResult({ ...clone(), status: 'failed' })).toMatchObject({ ok: false });
    expect(normalizeResult(null)).toMatchObject({ ok: false, reason: 'not_an_object' });
    expect(normalizeResult({ ...clone(), id: '' })).toMatchObject({ ok: false, reason: 'missing_id' });
  });

  it('rejects a result missing any core metric', () => {
    const r = clone();
    delete (r.result_json as Record<string, unknown>).hd_pore;
    expect(normalizeResult(r)).toEqual({ ok: false, code: 'invalid_result', reason: 'missing_pore_visibility' });
    const r2 = clone();
    (r2.result_json.hd_wrinkle as Record<string, unknown>).whole = {};
    expect(normalizeResult(r2)).toMatchObject({ ok: false, reason: 'missing_wrinkle_visibility' });
  });

  it('rejects NaN, strings and out-of-range scores', () => {
    for (const bad of [Number.NaN, '82.5', 101, -1, null]) {
      const r = clone();
      (r.result_json.hd_redness as Record<string, unknown>).ui_score = bad;
      expect(normalizeResult(r)).toMatchObject({ ok: false, reason: 'missing_redness_appearance' });
    }
  });

  it('accepts boundary scores and rounds to one decimal', () => {
    const r = clone();
    (r.result_json.hd_redness as Record<string, unknown>).ui_score = 0;
    (r.result_json.hd_pore.whole as Record<string, unknown>).ui_score = 100;
    (r.result_json.hd_texture.whole as Record<string, unknown>).ui_score = 74.349;
    const res = normalizeResult(r);
    if (!res.ok) throw new Error('expected ok');
    const v = (c: string) => res.metrics.find((m) => m.metric_code === c)?.value;
    expect(v('redness_appearance')).toBe(0);
    expect(v('pore_visibility')).toBe(100);
    expect(v('texture_smoothness')).toBe(74.3);
  });

  it('minimises the stored raw payload', () => {
    const raw = minimiseRaw(dermiqSample);
    const rj = raw.result_json as Record<string, unknown>;
    expect(Object.keys(rj).sort()).toEqual(
      ['hd_acne', 'hd_age_spot', 'hd_dark_circle', 'hd_eye_bag', 'hd_firmness', 'hd_moisture', 'hd_oiliness', 'hd_pore', 'hd_radiance', 'hd_redness', 'hd_texture', 'hd_wrinkle', 'skin_tone'].sort(),
    );
    expect(raw).not.toHaveProperty('mask_filenames');
    expect(raw).not.toHaveProperty('overall_score');
    expect(raw).not.toHaveProperty('skin_age');
    expect(raw).not.toHaveProperty('result_json.faceshape');
    expect(raw).not.toHaveProperty('result_json.agegender');
    expect(raw).toMatchObject({ id: dermiqSample.id, analysis_type: 'quick', processing_time_ms: 6157 });
    const kept = minimiseRaw(dermiqSample, true).result_json as Record<string, unknown>;
    expect(kept).toHaveProperty('skin_age', 33);
    expect(kept).toHaveProperty('all');
  });
});

describe('isDue (server gate)', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  it('is due with no succeeded scan, exactly at 7 days, and after', () => {
    expect(isDue(null, now)).toBe(true);
    expect(isDue(new Date(now - SCAN_INTERVAL_MS).toISOString(), now)).toBe(true);
    expect(isDue(new Date(now - SCAN_INTERVAL_MS - 1).toISOString(), now)).toBe(true);
  });
  it('is not due one millisecond before 7 days', () => {
    expect(isDue(new Date(now - SCAN_INTERVAL_MS + 1).toISOString(), now)).toBe(false);
    expect(isDue(new Date(now).toISOString(), now)).toBe(false);
  });
});
