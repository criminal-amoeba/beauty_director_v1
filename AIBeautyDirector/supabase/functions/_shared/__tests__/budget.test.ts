/** @jest-environment node */
import { estimateTokens, fitBudget } from '../context/budget';
import { SECTION_ORDER, type Sections } from '../context/types';

describe('estimateTokens', () => {
  it('counts ~4 latin chars per token and ~1.5 CJK chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(40))).toBe(10);
    expect(estimateTokens('保'.repeat(15))).toBe(10);
    expect(estimateTokens('保'.repeat(15))).toBeGreaterThan(estimateTokens('a'.repeat(15)));
  });
});

describe('fitBudget', () => {
  const big = (n: number) => 'x'.repeat(n);
  const all = (): Sections => Object.fromEntries(SECTION_ORDER.map((name) => [name, name === 'messages' ? [big(40), big(40), big(40)] : big(40)]));

  it('keeps everything when it fits', () => {
    const r = fitBudget(all(), 10_000);
    expect(r.dropped).toEqual([]);
    expect(Object.keys(r.kept)).toHaveLength(SECTION_ORDER.length);
  });

  it('trims the oldest messages one at a time before dropping sections', () => {
    const sections = all();
    const full = estimateTokens(JSON.stringify(sections));
    const r = fitBudget(sections, full - 5);
    expect(r.dropped).toEqual([]);
    expect(r.kept.messages).toEqual([big(40), big(40)]);
  });

  it('drops sections from the lowest priority up and never the first three', () => {
    const r = fitBudget(all(), 1);
    expect(r.dropped).toEqual(['messages', 'last_replies', 'summary', 'changes', 'adherence', 'scans', 'products', 'routine']);
    expect(Object.keys(r.kept).sort()).toEqual(['facts', 'profile', 'reactions']);
    expect(r.tokens).toBeGreaterThan(1); // reports the real size even when it can't fit
  });

  it('does not touch the input object', () => {
    const sections = all();
    fitBudget(sections, 1);
    expect(Object.keys(sections)).toHaveLength(SECTION_ORDER.length);
  });
});
