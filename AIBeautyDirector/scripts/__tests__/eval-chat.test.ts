/** @jest-environment node */
import { createLlm, MOCK_CHAT, MOCK_REVIEW } from '../../supabase/functions/_shared/adapters/llm';
import { CASES } from '../eval-cases';
import { renderReport, runEval } from '../eval-chat';

const mock = createLlm({ mode: 'mock', provider: 'openai', apiKey: '', model: 'x' });

describe('eval harness (mock llm)', () => {
  it('runs chat and scan cases through the real handlers and renders a readable report', async () => {
    const cases = CASES.filter((c) => c.id === 'en-routine-gentle' || c.id === 'scan-first-en');
    expect(cases).toHaveLength(2);
    const report = await runEval({ llm: mock, model: 'mock', cases });
    expect(report.results).toHaveLength(2);
    const md = renderReport(report);
    expect(md).toContain('| cases |');
    expect(md).toContain('## en-routine-gentle');
    expect(md).toContain('## scan-first-en');
    expect(md).toContain(`> ${MOCK_CHAT.en.text}`);
    expect(md).toContain(`> ${MOCK_REVIEW.en}`);
    expect(md).toContain('"quick_replies"');
    expect(md).not.toContain('**MISSING BLOCK');
    expect(md).not.toContain('**FALLBACK');
  });

  it('flags a missing expected block and a safety hit', async () => {
    const unsafe = { complete: async () => ({ text: 'See a dermatologist.', model: 'bad', promptTokens: 1, completionTokens: 1, reasoningTokens: 0 }) };
    const report = await runEval({ llm: unsafe, model: 'bad', cases: CASES.filter((c) => c.id === 'en-scan-question') });
    const md = renderReport(report);
    expect(md).toContain('**FALLBACK · SAFETY · MISSING BLOCK scan_summary**'.replace(' · SAFETY', '')); // a safety hit twice → template, then no block
    expect(report.summary.fallback).toBe(1);
  });

  it('ships 18 cases covering both locales, all personas and the unsafe set', () => {
    expect(CASES).toHaveLength(18);
    expect(new Set(CASES.map((c) => c.locale))).toEqual(new Set(['en', 'zh-TW']));
    expect(new Set(CASES.map((c) => c.persona))).toEqual(new Set(['gentle', 'professional', 'strict_coach']));
    expect(CASES.filter((c) => c.kind === 'scan_review')).toHaveLength(3);
    expect(CASES.filter((c) => c.kind === 'chat' && c.mustNotHit)).toHaveLength(2);
  });
});
