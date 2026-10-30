/** @jest-environment node */
import { MOCK_REVIEW } from '../adapters/llm';
import { LOCALES } from '../codes';
import { checkReply, RED_FLAG_GUIDANCE, stripMarkdown } from '../safety/check';
import { FORBIDDEN_TERMS } from '../safety/terms';

describe('checkReply', () => {
  it.each([
    ['I diagnose mild rosacea here.', ['en_diagnose', 'en_condition']],
    ['This treatment will cure your acne.', ['en_treat', 'en_cure', 'en_condition']],
    ['Ask your dermatologist for a prescription.', ['en_prescribe', 'en_doctor']],
    ['Your skin age is 32 and your overall score is 78.', ['en_scores']],
    ['Looks like eczema or dermatitis, maybe an infection.', ['en_disease', 'en_condition']],
    ['Diagnosed with Psoriasis', ['en_diagnose', 'en_condition']],
  ])('flags English diagnosis language: %s', (text, ids) => {
    const res = checkReply(text);
    expect(res.ok).toBe(false);
    expect(res.hits).toEqual(expect.arrayContaining(ids));
  });

  it.each([
    ['你的皮膚可能有玫瑰斑，建議治療。', ['zh_condition', 'zh_treat']],
    ['這看起來像濕疹，請找皮膚科醫師診斷。', ['zh_condition', 'zh_doctor', 'zh_diagnose']],
    ['你的膚齡是 32，總分 78。', ['zh_scores']],
    ['可能是痤瘡或皮膚炎發炎感染。', ['zh_condition', 'zh_disease']],
    ['醫生會開處方療程。', ['zh_doctor', 'zh_prescribe', 'zh_treat']],
  ])('flags Traditional Chinese diagnosis language: %s', (text, ids) => {
    const res = checkReply(text);
    expect(res.ok).toBe(false);
    expect(res.hits).toEqual(expect.arrayContaining(ids));
  });

  it('passes appearance language in both languages', () => {
    expect(checkReply('Your redness appearance is a little calmer and pore visibility is about the same. You do not need to buy anything new.').ok).toBe(true);
    expect(checkReply('泛紅狀況比上次穩定一些，毛孔可見度差不多。目前不需要購買新的產品，痘痘有改善。').ok).toBe(true);
    expect(checkReply('Treat yourself kindly').ok).toBe(false); // "treat" is blocked on purpose
    expect(checkReply('A secure, curated routine with a treatment-free focus').ok).toBe(false);
    expect(checkReply('A secure, curated, careful routine').ok).toBe(true); // no false positives on secure/curated
  });

  it('red-flag guidance, mock reviews and disclaimers pass', () => {
    for (const locale of LOCALES) {
      expect(checkReply(RED_FLAG_GUIDANCE[locale])).toEqual({ ok: true, hits: [] });
      expect(checkReply(MOCK_REVIEW[locale])).toEqual({ ok: true, hits: [] });
    }
  });

  it('covers both languages and the never-shown scores', () => {
    const ids = FORBIDDEN_TERMS.map((t) => t.id);
    expect(ids.some((i) => i.startsWith('en_'))).toBe(true);
    expect(ids.some((i) => i.startsWith('zh_'))).toBe(true);
    expect(ids).toEqual(expect.arrayContaining(['en_scores', 'zh_scores', 'en_diagnose', 'zh_diagnose']));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('zh swelling wording', () => {
  it('flags 紅腫 (swollen) so Chinese replies stay with 泛紅 (redness appearance)', () => {
    expect(checkReply('臉頰有點紅腫').hits).toEqual(['zh_swelling']);
    expect(checkReply('泛紅狀況比上週穩定').ok).toBe(true);
  });
});

describe('stripMarkdown', () => {
  it('removes the allowed markers so split words and list items are still checked', () => {
    expect(stripMarkdown('**Key:** keep it simple\n- step one\n2. step two')).toBe('Key: keep it simple\nstep one\nstep two');
    expect(checkReply(stripMarkdown('**treat**ment')).hits).toEqual(['en_treat']);
    expect(checkReply(stripMarkdown('- 治療')).hits).toEqual(['zh_treat']);
    expect(stripMarkdown('*soft* and _calm_')).toBe('soft and calm');
  });
});
