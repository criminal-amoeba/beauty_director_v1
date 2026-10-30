/** @jest-environment node */
import { LOCALES } from '../codes';
import {
  BLOCKS_PROMPT, buildChatSystemPrompt, buildSystemPrompt, buildUserMessage, CHARACTER, EXAMPLES, FIRST_SCAN_NOTE, PERSONAS, renderExamples, RULES, SCAN_EXAMPLES, SCAN_RULES,
  LANGUAGE, STRICTER_SUFFIX, STYLE_RULES, TONE, toPersona, UNTRUSTED_DATA_RULE,
} from '../persona';
import { checkReply, stripMarkdown } from '../safety/check';
import type { ApprovedReview } from '../rules/review';

const sample: ApprovedReview = {
  metrics: [
    { code: 'pore_visibility', value: 68.9, trend: 'flat' },
    { code: 'redness_appearance', value: 82.5, trend: null },
  ],
  focus: ['pore_visibility'],
  actions: [{ code: 'avoid_ingredient', ingredient: 'fragrance' }, { code: 'max_one_new_active' }, { code: 'no_purchase_needed' }],
};

const emojis = (s: string) => (s.match(/\p{Extended_Pictographic}/gu) ?? []).length;
const listItems = (s: string) => s.split('\n').filter((l) => /^\s*([-*•]|\d+[.)])\s/.test(l)).length;
const questions = (s: string) => (s.match(/[?？]/g) ?? []).length;

describe('character sheet', () => {
  it('defines who she is, her values and her speech habits', () => {
    expect(CHARACTER).toMatch(/Beauty Director/);
    expect(CHARACTER).toMatch(/at most one question/i);
    expect(CHARACTER).toMatch(/small win/i);
    expect(CHARACTER).not.toMatch(/Great question/);
  });

  it('writes the rules as a short positive list with the vocabulary boundary explicit', () => {
    expect(RULES).toContain('qualified professional');
    expect(RULES).toMatch(/appearance/);
    expect((RULES.match(/\bnever\b/gi) ?? []).length).toBeLessThanOrEqual(2);
    expect(RULES).not.toMatch(/Hard rules/);
    expect(SCAN_RULES).toContain(RULES);
    expect(SCAN_RULES).toMatch(/numbers, focus/i);
    // what the minimal-effort eval showed the model doing: offering app features that do not exist,
    // and narrating the scaffolding ("approved actions", "your data", "key takeaway")
    expect(RULES).toMatch(/no reminders/i);
    expect(RULES).toMatch(/approved|DATA/);
    expect(STYLE_RULES).toMatch(/key takeaway/i);
    expect(STYLE_RULES).toMatch(/two numbers/i);
    expect(LANGUAGE['zh-TW']).toContain('泛紅狀況');
  });

  it('allows only the markdown subset the app renders', () => {
    expect(STYLE_RULES).toMatch(/\*\*bold\*\*/);
    expect(STYLE_RULES).toMatch(/at most 4/i);
    expect(STYLE_RULES).toMatch(/no headings, links, images, tables or code/i);
    expect(STYLE_RULES).toMatch(/one emoji/i);
  });

  it('keeps every tone free of shaming and the professional one free of clinical framing', () => {
    for (const persona of PERSONAS) expect(TONE[persona]).toMatch(/never (shame|shaming|sarcastic)/i);
    expect(TONE.professional.toLowerCase()).not.toContain('clinical');
    expect(TONE.gentle).toMatch(/one emoji/i);
    expect(TONE.professional).toMatch(/no emoji/i);
    expect(TONE.strict_coach).toMatch(/no emoji/i);
  });
});

describe('example exchanges', () => {
  it('exist for every persona and locale, 2–3 each, and follow the style and safety rules', () => {
    for (const persona of PERSONAS) for (const locale of LOCALES) {
      const list = EXAMPLES[persona][locale];
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list.length).toBeLessThanOrEqual(3);
      for (const { user, assistant } of list) {
        expect(user.length).toBeGreaterThan(0);
        expect(checkReply(stripMarkdown(assistant))).toEqual({ ok: true, hits: [] });
        expect(assistant).not.toMatch(/^#|\n#/);
        expect(assistant).not.toContain('](');
        expect(listItems(assistant)).toBeLessThanOrEqual(4);
        expect(emojis(assistant)).toBeLessThanOrEqual(persona === 'gentle' ? 1 : 0);
        expect(questions(assistant)).toBeLessThanOrEqual(1);
        expect((assistant.match(/\*\*/g) ?? []).length).toBeLessThanOrEqual(2);
      }
      // at least one example shows a formatted list and one shows the bold takeaway
      expect(list.some((e) => listItems(e.assistant) >= 2)).toBe(true);
      expect(list.some((e) => e.assistant.includes('**'))).toBe(true);
    }
  });

  it('scan examples exist per locale for a first and a follow-up scan and pass the same checks', () => {
    for (const locale of LOCALES) {
      for (const text of [SCAN_EXAMPLES[locale].first, SCAN_EXAMPLES[locale].followup]) {
        expect(checkReply(stripMarkdown(text))).toEqual({ ok: true, hits: [] });
        expect(listItems(text)).toBeLessThanOrEqual(4);
        expect(text).not.toMatch(/not medical advice|並非醫療意見/);
      }
      expect(SCAN_EXAMPLES[locale].first).not.toMatch(/last time|上次/);
    }
  });
});

describe('buildChatSystemPrompt', () => {
  it('carries the character, rules, style, untrusted-data rule, examples and the language line', () => {
    for (const persona of PERSONAS) for (const locale of LOCALES) {
      const p = buildChatSystemPrompt({ persona, locale });
      for (const part of [CHARACTER, TONE[persona], RULES, STYLE_RULES, UNTRUSTED_DATA_RULE]) expect(p).toContain(part);
      expect(p).toContain(EXAMPLES[persona][locale][0].assistant);
      expect(p).toContain(locale === 'en' ? 'Reply in English.' : '繁體中文');
      expect(p).not.toContain(STRICTER_SUFFIX);
      expect(p).not.toContain('JSON');
    }
    expect(buildChatSystemPrompt({ persona: 'gentle', locale: 'en', stricter: true })).toContain(STRICTER_SUFFIX);
  });

  it('differs between personas only in the tone and the examples', () => {
    const strip = (persona: 'gentle' | 'strict_coach') =>
      buildChatSystemPrompt({ persona, locale: 'en' }).replace(TONE[persona], '').replace(renderExamples(persona, 'en'), '');
    expect(strip('gentle')).toBe(strip('strict_coach'));
    expect(TONE.gentle).not.toBe(TONE.strict_coach);
  });

  it('keeps the untrusted-data rule free of forbidden wording', () => {
    expect(checkReply(UNTRUSTED_DATA_RULE).ok).toBe(true);
  });
});

describe('BLOCKS_PROMPT', () => {
  it('lists the six intents, asks for a blocks object only, and says most replies need none', () => {
    for (const t of ['quick_replies', 'choice', 'product_mention', 'routine_intent', 'change_intent', 'scan_summary']) expect(BLOCKS_PROMPT).toContain(`"${t}"`);
    expect(BLOCKS_PROMPT).toContain('{"blocks"');
    expect(BLOCKS_PROMPT).toMatch(/none or one/i);
    expect(BLOCKS_PROMPT).toMatch(/never ids/i);
    // the three triggers the small model missed in the eval, each with a worked example
    expect(BLOCKS_PROMPT).toMatch(/stings/);
    expect(BLOCKS_PROMPT).toMatch(/budget/);
    expect(BLOCKS_PROMPT).toMatch(/even if the reply advises against/i);
    expect(BLOCKS_PROMPT).toMatch(/reminders/i);
    expect((BLOCKS_PROMPT.match(/Example/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildSystemPrompt (scan review)', () => {
  it('shares the character and tone with chat and carries the scan rules', () => {
    for (const locale of LOCALES) {
      const prompts = PERSONAS.map((persona) => buildSystemPrompt({ persona, locale }));
      for (const p of prompts) {
        expect(p).toContain(CHARACTER);
        expect(p).toContain(SCAN_RULES);
        expect(p).toContain(STYLE_RULES);
      }
      expect(new Set(prompts).size).toBe(PERSONAS.length);
    }
    const zh = buildSystemPrompt({ persona: 'gentle', locale: 'zh-TW' });
    expect(zh).toContain('Traditional Chinese');
    expect(zh).toContain('Never use Simplified Chinese');
    expect(zh.startsWith(CHARACTER)).toBe(true);
  });

  it('adds the first-scan note and example only for a first scan', () => {
    const first = buildSystemPrompt({ persona: 'gentle', locale: 'en', firstScan: true });
    expect(first).toContain(FIRST_SCAN_NOTE);
    expect(first).toContain(SCAN_EXAMPLES.en.first);
    expect(first).not.toContain(SCAN_EXAMPLES.en.followup);
    const later = buildSystemPrompt({ persona: 'gentle', locale: 'en', firstScan: false });
    expect(later).not.toContain(FIRST_SCAN_NOTE);
    expect(later).toContain(SCAN_EXAMPLES.en.followup);
    expect(buildSystemPrompt({ persona: 'gentle', locale: 'en' })).toContain(SCAN_EXAMPLES.en.followup);
  });

  it('adds the stricter suffix only on retry', () => {
    expect(buildSystemPrompt({ persona: 'gentle', locale: 'en' })).not.toContain(STRICTER_SUFFIX);
    expect(buildSystemPrompt({ persona: 'gentle', locale: 'en', stricter: true })).toContain(STRICTER_SUFFIX);
  });
});

describe('buildUserMessage', () => {
  it('contains only approved structured data with English labels', () => {
    const msg = buildUserMessage(sample, false);
    expect(msg.startsWith('DATA\n')).toBe(true);
    const data = JSON.parse(msg.slice('DATA\n'.length, msg.indexOf('\n\nExplain')));
    expect(data).toEqual({
      first_scan: false,
      metrics: [
        { code: 'pore_visibility', label: 'pore visibility', value: 68.9, change: 'same as last time' },
        { code: 'redness_appearance', label: 'redness appearance', value: 82.5, change: null },
      ],
      scale: '0-100, higher = healthier-looking appearance; "change" already says whether a metric got better or worse',
      focus: ['pore visibility'],
      approved_actions: sample.actions,
    });
    expect(msg).not.toMatch(/hd_|skin_age|overall/);
  });
});

describe('toPersona', () => {
  it('accepts the three DB codes and defaults to gentle', () => {
    expect(toPersona('strict_coach')).toBe('strict_coach');
    expect(toPersona('professional')).toBe('professional');
    expect(toPersona('strict')).toBe('gentle');
    expect(toPersona(undefined)).toBe('gentle');
  });
});
