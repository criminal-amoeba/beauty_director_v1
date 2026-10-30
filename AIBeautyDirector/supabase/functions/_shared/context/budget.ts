// Token budget for the chat context. shortcut: no tokenizer; CJK ≈ 1.5 chars/token, everything else ≈ 4.
// Upgrade to real counts when the logged prompt_tokens diverge from this estimate by more than 20%.
import { NEVER_DROPPED, SECTION_ORDER, type SectionName, type Sections } from './types.ts';

const CJK = /[　-ヿ㐀-鿿豈-﫿＀-￯]/g;

export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  return Math.ceil(cjk / 1.5 + (text.length - cjk) / 4);
}

// Drops from the lowest-priority section up; inside `messages` the oldest message goes first, one at a time.
export function fitBudget(sections: Sections, budget: number): { kept: Sections; dropped: SectionName[]; tokens: number } {
  const kept: Sections = { ...sections };
  const dropped: SectionName[] = [];
  const size = () => estimateTokens(JSON.stringify(kept));
  while (size() > budget) {
    const messages = kept.messages as unknown[] | undefined;
    if (messages && messages.length > 1) {
      kept.messages = messages.slice(1);
      continue;
    }
    const name = [...SECTION_ORDER].reverse().find((n) => n in kept && !NEVER_DROPPED.includes(n));
    if (!name) break;
    delete kept[name];
    dropped.push(name);
  }
  return { kept, dropped, tokens: size() };
}
