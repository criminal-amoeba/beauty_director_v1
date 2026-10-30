/** @jest-environment node */
import { LOCALES, METRIC_CODES } from '../codes';
import { ACTION_CODES, type Action, type ApprovedReview } from '../rules/review';
import { checkReply } from '../safety/check';
import { ACTION_TEXT, actionText, CHAT_FALLBACK, DISCLAIMER, fallbackReview, METRIC_LABELS, TREND_TEXT } from '../templates';

const everyAction: Action[] = [
  { code: 'avoid_ingredient', ingredient: 'fragrance' },
  { code: 'avoid_ingredient', ingredient: 'some_custom_thing' },
  { code: 'max_one_new_active' },
  { code: 'gentle_routine' },
  { code: 'add_spf_am' },
  { code: 'add_moisturizer_pm' },
  { code: 'consider_product', category: 'sunscreen' },
  { code: 'consider_product', category: 'moisturizer' },
  { code: 'no_purchase_needed' },
  { code: 'keep_routine' },
];
const full: ApprovedReview = {
  metrics: METRIC_CODES.map((code, i) => ({ code, value: 50 + i, trend: (['up', 'down', 'flat', null] as const)[i % 4] })),
  focus: ['pore_visibility', 'dark_circle_visibility'],
  actions: everyAction,
};

describe('templates', () => {
  it('has a label for every metric, action and trend in both locales', () => {
    for (const locale of LOCALES) {
      for (const code of METRIC_CODES) expect(METRIC_LABELS[locale][code]).toBeTruthy();
      for (const code of ACTION_CODES) expect(ACTION_TEXT[locale][code]).toBeTruthy();
      for (const t of ['up', 'down', 'flat'] as const) expect(TREND_TEXT[locale][t]).toBeTruthy();
      expect(DISCLAIMER[locale]).toBeTruthy();
    }
  });

  it('fills placeholders and falls back to a readable ingredient name', () => {
    expect(actionText({ code: 'avoid_ingredient', ingredient: 'fragrance' }, 'en')).toBe('Keep avoiding fragrance; your skin has reacted to it before.');
    expect(actionText({ code: 'avoid_ingredient', ingredient: 'tea_tree_oil' }, 'zh-TW')).toBe('請繼續避開tea tree oil，你的肌膚先前對它有反應。');
    expect(actionText({ code: 'consider_product', category: 'sunscreen' }, 'zh-TW')).toBe('準備好時，可以考慮添購一款基本的防曬。');
    expect(actionText({ code: 'keep_routine' }, 'en')).not.toContain('{x}');
  });

  it('fallback review passes the safety check with every action and trend, in both locales', () => {
    for (const locale of LOCALES) {
      const text = fallbackReview(full, locale);
      expect(checkReply(text)).toEqual({ ok: true, hits: [] });
      expect(text).not.toContain(DISCLAIMER[locale]); // the chat screen shows it once
      expect(text).not.toContain('{x}');
      expect(text).not.toMatch(/undefined|null/);
    }
  });

  it('fallback mentions the focus metrics with value and trend, and no trend on a first scan', () => {
    const en = fallbackReview(full, 'en');
    expect(en).toContain('pore visibility (52, about the same as last time)');
    expect(en).toContain('dark circle visibility (56, about the same as last time)');
    const first = fallbackReview({ ...full, metrics: full.metrics.map((m) => ({ ...m, trend: null })) }, 'en');
    expect(first).toContain('pore visibility (52)');
    expect(first).not.toContain('last time');
    const zh = fallbackReview(full, 'zh-TW');
    expect(zh).toContain('毛孔可見度（52，和上次差不多）');
    expect(zh).not.toContain('以上是一般保養建議');
  });

  it('every single template string passes the safety check on its own', () => {
    for (const locale of LOCALES) {
      for (const s of [...Object.values(METRIC_LABELS[locale]), ...Object.values(ACTION_TEXT[locale]), ...Object.values(TREND_TEXT[locale]), DISCLAIMER[locale]]) {
        expect(checkReply(s)).toEqual({ ok: true, hits: [] });
      }
    }
  });
});

describe('chat fallback', () => {
  it('passes the safety check and carries no disclaimer (the chat screen shows it)', () => {
    for (const locale of LOCALES) {
      expect(checkReply(CHAT_FALLBACK[locale])).toEqual({ ok: true, hits: [] });
      expect(CHAT_FALLBACK[locale]).not.toContain(DISCLAIMER[locale]);
    }
  });
});
