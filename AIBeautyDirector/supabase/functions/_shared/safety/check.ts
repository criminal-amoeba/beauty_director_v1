// Post-filter for every AI reply, both languages. A hit means retry once with STRICTER_SUFFIX, then fall back
// to templates.ts; forbidden wording never reaches the user.
import type { Locale } from '../codes.ts';
import { FORBIDDEN_TERMS, type Term } from './terms.ts';

export type SafetyResult = { ok: boolean; hits: string[] };

// The markdown subset replies may use (bold, italic, list markers), removed so a term split by markers or a
// list item is checked as plain words. Callers pass stripMarkdown(text) to checkReply.
export function stripMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''))
    .join('\n')
    .replace(/\*\*|\*|_/g, '');
}

export function checkReply(text: string, terms: readonly Term[] = FORBIDDEN_TERMS): SafetyResult {
  const hits = terms.filter((t) => t.re.test(text)).map((t) => t.id);
  return { ok: hits.length === 0, hits };
}

// Medical red flags: point to a professional, never speculate.
export const RED_FLAG_GUIDANCE: Record<Locale, string> = {
  en: 'If you notice persistent pain, burning or rapid worsening, please see a qualified professional.',
  'zh-TW': '若出現持續疼痛、灼熱感或快速惡化，請諮詢專業人士。',
};
