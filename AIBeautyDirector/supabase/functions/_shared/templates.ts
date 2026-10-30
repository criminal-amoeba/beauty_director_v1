// Human wording for codes (both locales) and the deterministic fallback review used when the LLM fails
// or its reply fails the safety check. Every string here must pass safety/check.ts (tested). No disclaimer in
// any message: the chat screen shows it once under the conversation.
import type { Locale, MetricCode } from './codes.ts';
import type { Action, ActionCode, ApprovedReview, GapCategory, Trend } from './rules/review.ts';

export const METRIC_LABELS: Record<Locale, Record<MetricCode, string>> = {
  en: {
    breakout_visibility: 'visible breakouts',
    wrinkle_visibility: 'fine line visibility',
    pore_visibility: 'pore visibility',
    redness_appearance: 'redness appearance',
    oiliness_balance: 'oil balance',
    texture_smoothness: 'texture smoothness',
    dark_circle_visibility: 'dark circle visibility',
    firmness_appearance: 'firmness appearance',
    hydration_balance: 'hydration appearance',
    wrinkle_forehead: 'forehead lines',
    wrinkle_crow_feet: 'lines around the eyes',
    wrinkle_nasolabial: 'smile lines',
  },
  'zh-TW': {
    breakout_visibility: '痘痘可見度',
    wrinkle_visibility: '細紋可見度',
    pore_visibility: '毛孔可見度',
    redness_appearance: '泛紅狀況',
    oiliness_balance: '油水平衡',
    texture_smoothness: '膚質平滑度',
    dark_circle_visibility: '黑眼圈可見度',
    firmness_appearance: '緊緻度',
    hydration_balance: '保水度',
    wrinkle_forehead: '額頭紋路',
    wrinkle_crow_feet: '眼周紋路',
    wrinkle_nasolabial: '法令紋',
  },
};

// How a change is handed to the LLM: the rules engine's verdict in words, so a "down" trend on a metric
// like pore visibility is never misread as an improvement (seen in the 2026-10-30 eval).
export const CHANGE_WORDS: Record<Trend, string> = { up: 'better than last time', down: 'worse than last time', flat: 'same as last time' };

export const TREND_TEXT: Record<Locale, Record<Trend, string>> = {
  en: { up: 'improving', down: 'a little lower than last time', flat: 'about the same as last time' },
  'zh-TW': { up: '進步中', down: '比上次略低', flat: '和上次差不多' },
};

export const CATEGORY_LABELS: Record<Locale, Record<GapCategory, string>> = {
  en: { sunscreen: 'sunscreen', moisturizer: 'moisturizer' },
  'zh-TW': { sunscreen: '防曬', moisturizer: '保濕乳霜' },
};

// product_reactions.ingredient is free text; these cover the app's own ingredient codes.
export const INGREDIENT_LABELS: Record<Locale, Record<string, string>> = {
  en: {
    fragrance: 'fragrance',
    alcohol: 'drying alcohol',
    essential_oils: 'essential oils',
    retinoids: 'retinoids',
    exfoliating_acids: 'exfoliating acids',
    vitamin_c: 'vitamin C',
    benzoyl_peroxide: 'benzoyl peroxide',
    niacinamide: 'niacinamide',
  },
  'zh-TW': {
    fragrance: '香精',
    alcohol: '酒精',
    essential_oils: '精油',
    retinoids: 'A醇類成分',
    exfoliating_acids: '去角質酸類',
    vitamin_c: '維他命C',
    benzoyl_peroxide: '過氧化苯甲醯',
    niacinamide: '菸鹼醯胺',
  },
};

export const ACTION_TEXT: Record<Locale, Record<ActionCode, string>> = {
  en: {
    avoid_ingredient: 'Keep avoiding {x}; your skin has reacted to it before.',
    max_one_new_active: 'If you add something new, add only one active at a time.',
    gentle_routine: 'Keep the routine gentle this week: a mild cleanser, no scrubs or strong acids.',
    add_spf_am: 'Add a sunscreen as the last step of your morning routine.',
    add_moisturizer_pm: 'Finish your evening routine with a moisturizer.',
    consider_product: 'When you are ready, a basic {x} would fill that gap.',
    no_purchase_needed: 'You do not need to buy anything new right now.',
    keep_routine: 'Your routine covers the basics; keep going as you are.',
  },
  'zh-TW': {
    avoid_ingredient: '請繼續避開{x}，你的肌膚先前對它有反應。',
    max_one_new_active: '如果要加入新產品，一次只加一種活性成分。',
    gentle_routine: '本週保養以溫和為主：溫和潔面，先不用磨砂或高濃度酸類。',
    add_spf_am: '早上保養的最後一步加上防曬。',
    add_moisturizer_pm: '晚上保養的最後一步加上保濕乳霜。',
    consider_product: '準備好時，可以考慮添購一款基本的{x}。',
    no_purchase_needed: '目前不需要購買新的產品。',
    keep_routine: '你的保養流程已涵蓋基本步驟，繼續保持就好。',
  },
};

// Chat reply when the LLM fails or its reply fails the safety check twice. Never claims anything about the skin.
export const CHAT_FALLBACK: Record<Locale, string> = {
  en: 'I could not put that into words safely just now. Could you ask me again, maybe in a slightly different way?',
  'zh-TW': '剛才我沒辦法妥善回答這個問題，可以換個方式再問我一次嗎？',
};

export const DISCLAIMER: Record<Locale, string> = {
  en: 'This is general skincare guidance, not medical advice.',
  'zh-TW': '以上是一般保養建議，並非醫療意見。',
};

const ingredientLabel = (locale: Locale, code: string) => INGREDIENT_LABELS[locale][code] ?? code.replace(/_/g, ' ');

export function actionText(action: Action, locale: Locale): string {
  const t = ACTION_TEXT[locale][action.code];
  if (action.code === 'avoid_ingredient') return t.replace('{x}', ingredientLabel(locale, action.ingredient));
  if (action.code === 'consider_product') return t.replace('{x}', CATEGORY_LABELS[locale][action.category]);
  return t;
}

export function fallbackReview(review: ApprovedReview, locale: Locale): string {
  const label = (code: MetricCode) => METRIC_LABELS[locale][code];
  const focus = review.focus.map((code) => {
    const m = review.metrics.find((x) => x.code === code);
    const trend = m?.trend ? (locale === 'en' ? `, ${TREND_TEXT.en[m.trend]}` : `，${TREND_TEXT['zh-TW'][m.trend]}`) : '';
    return locale === 'en' ? `${label(code)} (${m?.value ?? '–'}${trend})` : `${label(code)}（${m?.value ?? '–'}${trend}）`;
  });
  const actions = review.actions.map((a) => actionText(a, locale));
  if (locale === 'en') {
    const intro = focus.length > 0 ? `Here is your weekly check-in. This week we focus on ${focus.join(' and ')}.` : 'Here is your weekly check-in.';
    return [intro, ...actions].join(' ');
  }
  const intro = focus.length > 0 ? `這是你本週的檢測回顧。本週重點放在${focus.join('和')}。` : '這是你本週的檢測回顧。';
  return [intro, ...actions].join('');
}
