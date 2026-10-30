// Server-built chat context (step 10 §B), pure. Every section is plain JSON; user-typed text (names, brands,
// ingredients, messages) is only ever a JSON string value, never interpolated into prose, and the system prompt
// says so. Metrics go out as labels (never codes); deltas only between scans that `comparable()` allows.
// `facts` (facts.ts) is a short plain-language pick per question; `last_replies` lets the prompt say "don't repeat".
import type { Metric, MetricCode } from '../codes.ts';
import { comparable, type ScanVersion } from '../rules/goals.ts';
import { RULES_CONFIG } from '../rules/review.ts';
import { CHANGE_WORDS, METRIC_LABELS } from '../templates.ts';
import { estimateTokens, fitBudget } from './budget.ts';
import { pickFacts } from './facts.ts';
import { type ContextData, type ContextOpts, type ContextPack, type Sections } from './types.ts';

export const PRODUCT_TEXT_CAP = 300; // ingredients_text characters sent to the LLM
export const VALUE_CAP = 120; // change-event string values
const CHANGE_KEYS = ['name', 'brand', 'category', 'status', 'use_time', 'key_actives', 'opened_at', 'period', 'version', 'source',
  'reaction', 'ingredient', 'severity', 'resolved_at', 'persona', 'locale', 'timezone', 'goals', 'budget', 'routine_level', 'textures'];

export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55+';
export function ageBand(birthDate: string | null, now: number): AgeBand | null {
  if (!birthDate) return null;
  const b = new Date(birthDate + 'T00:00:00Z');
  const n = new Date(now);
  let age = n.getUTCFullYear() - b.getUTCFullYear();
  if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) age--;
  return age < 25 ? '18-24' : age < 35 ? '25-34' : age < 45 ? '35-44' : age < 55 ? '45-54' : '55+';
}

export const daysAgo = (today: string, n: number): string => {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const capValue = (v: unknown): unknown => {
  if (typeof v === 'string') return v.length > VALUE_CAP ? v.slice(0, VALUE_CAP) : v;
  if (Array.isArray(v)) return v.slice(0, 12).map(capValue);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => CHANGE_KEYS.includes(k)).map(([k, x]) => [k, capValue(x)]));
  }
  return v;
};

export const LAST_REPLY_CAP = 400;

// The rules engine's trend verdict in words (same threshold as rules/review.ts).
export const changeWord = (value: number, previous: number) =>
  CHANGE_WORDS[Math.abs(value - previous) < RULES_CONFIG.trendDelta ? 'flat' : value > previous ? 'up' : 'down'];

export function renderSections(data: ContextData, opts: ContextOpts, newMessage = ''): Sections {
  const productName = new Map(data.products.map((p) => [p.id, [p.brand, p.name].filter(Boolean).join(' ')]));
  const label = (code: string) => METRIC_LABELS.en[code as MetricCode] ?? code;

  const versionOf = (s: ContextData['scans'][number]): ScanVersion => ({
    provider: s.provider,
    provider_model_version: s.provider_model_version,
    capture_protocol_version: s.capture_protocol_version,
    metric_definition_version: s.metrics[0]?.metric_definition_version ?? '',
  });
  const scans = data.scans.map((s, i) => {
    const older = data.scans[i + 1];
    const cmp = older ? comparable(versionOf(s), versionOf(older)) : null;
    const prev = new Map((older?.metrics ?? []).map((m: Metric) => [m.metric_code, m.value]));
    return {
      date: s.completed_at.slice(0, 10),
      ...(cmp === false ? { not_comparable: true } : {}),
      metrics: s.metrics.map((m) => {
        const p = cmp ? prev.get(m.metric_code) : undefined;
        return { label: label(m.metric_code), value: m.value, ...(p === undefined ? {} : { delta: Math.round((m.value - p) * 10) / 10, change: changeWord(m.value, p) }) };
      }),
    };
  });

  const window = (days: number) => {
    const since = daysAgo(opts.today, days - 1);
    const inRange = data.completions.filter((c) => c.local_date >= since && c.local_date <= opts.today);
    return { days, am_done: inRange.filter((c) => c.period === 'am').length, pm_done: inRange.filter((c) => c.period === 'pm').length };
  };

  const routine: Record<string, unknown> = {};
  for (const r of data.routines) {
    routine[r.period] = {
      version: r.version,
      steps: [...r.steps].sort((a, b) => a.position - b.position).map((s) => ({ step_type: s.step_type, product: s.product_id ? productName.get(s.product_id) ?? null : null })),
    };
  }

  return {
    facts: pickFacts(data, newMessage, opts),
    reactions: data.reactions.map((r) => ({
      ingredient: r.ingredient, product: r.product_id ? productName.get(r.product_id) ?? null : null, reaction: r.reaction, severity: r.severity, noted_at: r.noted_at.slice(0, 10),
    })),
    profile: {
      display_name: data.profile.display_name,
      age_band: ageBand(data.profile.birth_date, opts.now),
      goals: data.profile.goals,
      routine_level: data.profile.routine_level,
      budget: data.profile.budget,
      textures: data.profile.textures,
    },
    routine,
    products: data.products.map((p) => ({
      id: p.id, name: p.name, brand: p.brand, category: p.category, status: p.status, use_time: p.use_time, key_actives: p.key_actives, opened_at: p.opened_at,
      ingredients_text: p.ingredients_text ? p.ingredients_text.slice(0, PRODUCT_TEXT_CAP) : null,
    })),
    scans: { scale: '0-100, higher = healthier-looking appearance; "change" already says whether a metric got better or worse', list: scans },
    adherence: [window(7), window(30)],
    changes: data.changes.map((c) => ({ when: c.created_at.slice(0, 10), entity: c.entity, field: c.field, from: capValue(c.old_value), to: capValue(c.new_value), source: c.source })),
    summary: data.summary ? { label: 'AI-generated summary of earlier conversation, not a fact source', text: data.summary } : null,
    last_replies: data.messages.filter((m) => m.role === 'assistant').slice(-2).map((m) => m.content.slice(0, LAST_REPLY_CAP)),
    messages: data.messages.map((m) => ({ role: m.role, at: m.created_at.slice(0, 16), content: m.content })),
  };
}

export function buildContext(data: ContextData, newMessage: string, opts: ContextOpts): ContextPack {
  const reserved = (opts.reservedTokens ?? 1200) + estimateTokens(newMessage);
  const { kept, dropped, tokens } = fitBudget(renderSections(data, opts, newMessage), (opts.budgetTokens ?? 6000) - reserved);
  return { sections: kept, dropped, estimatedTokens: tokens + reserved };
}

// The user turn. new_message sits inside the same JSON so it is data like everything else.
export function renderContext(pack: ContextPack, newMessage: string): string {
  return `DATA\n${JSON.stringify({ ...pack.sections, new_message: newMessage }, null, 1)}\n\nReply to new_message.`;
}
