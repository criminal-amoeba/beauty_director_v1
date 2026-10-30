// Deterministic rules engine: metrics + profile → the approved review the LLM is allowed to explain.
// Order: safety → reactions → skin state → goals → owned products → routine → budget → new products.
// Output is codes only; wording lives in templates.ts (fallback) or comes from the LLM.
import { CORE_METRIC_CODES, type Metric, type MetricCode } from '../codes.ts';
import { GOAL_METRICS } from './goals.ts';

export const RULES_CONFIG = { trendDelta: 5, focusCount: 2, lowScore: 50 } as const;
export type RulesConfig = typeof RULES_CONFIG;

export type Trend = 'up' | 'down' | 'flat';
export type Severity = 'mild' | 'moderate' | 'severe';
export type Budget = 'low' | 'mid' | 'high';
export type GapCategory = 'sunscreen' | 'moisturizer';

export type ReviewInput = {
  metrics: Metric[];
  previous: Metric[] | null; // the latest comparable scan (goals.ts `comparable`), else null
  goals: string[];
  budget: Budget | null;
  reactions: { ingredient: string | null; severity: Severity }[];
  ownedCategories: string[]; // user_products.category of active products
  routineSteps: { am: string[]; pm: string[] }; // routine_steps.step_type per period
};

export const ACTION_CODES = [
  'avoid_ingredient',
  'max_one_new_active',
  'gentle_routine',
  'add_spf_am',
  'add_moisturizer_pm',
  'consider_product',
  'no_purchase_needed',
  'keep_routine',
] as const;
export type ActionCode = (typeof ACTION_CODES)[number];
export type Action =
  | { code: 'avoid_ingredient'; ingredient: string }
  | { code: 'consider_product'; category: GapCategory }
  | { code: Exclude<ActionCode, 'avoid_ingredient' | 'consider_product'> };

export type ReviewMetric = { code: MetricCode; value: number; trend: Trend | null };
export type ApprovedReview = { metrics: ReviewMetric[]; focus: MetricCode[]; actions: Action[] };

const core = new Set<string>(CORE_METRIC_CODES);

export function review(input: ReviewInput, cfg: RulesConfig = RULES_CONFIG): ApprovedReview {
  const prev = new Map((input.previous ?? []).map((m) => [m.metric_code, m.value]));
  const metrics: ReviewMetric[] = input.metrics.map((m) => {
    const p = prev.get(m.metric_code);
    const trend: Trend | null =
      p === undefined ? null : Math.abs(m.value - p) < cfg.trendDelta ? 'flat' : m.value > p ? 'up' : 'down';
    return { code: m.metric_code, value: m.value, trend };
  });
  const byCode = new Map(metrics.map((m) => [m.code, m]));
  const value = (code: MetricCode) => byCode.get(code)?.value ?? 100;

  // Focus: the weakest metrics among those tied to the user's goals; all core metrics when goals map to nothing.
  const goalCodes = [...new Set(input.goals.flatMap((g) => GOAL_METRICS[g] ?? []))].filter((c) => byCode.has(c));
  const pool = goalCodes.length > 0 ? goalCodes.map((c) => byCode.get(c)!) : metrics.filter((m) => core.has(m.code));
  const focus = [...pool].sort((a, b) => a.value - b.value).slice(0, cfg.focusCount).map((m) => m.code);

  const actions: Action[] = [];
  // 1. Safety: recorded reactions come first and are never overridden.
  const avoid = new Set(
    input.reactions.flatMap((r) => (r.ingredient && r.severity !== 'mild' ? [r.ingredient] : [])),
  );
  for (const ingredient of avoid) actions.push({ code: 'avoid_ingredient', ingredient });
  actions.push({ code: 'max_one_new_active' });
  // 2. Current state.
  const severe = input.reactions.some((r) => r.severity === 'severe');
  if (severe || value('redness_appearance') < cfg.lowScore || value('texture_smoothness') < cfg.lowScore) {
    actions.push({ code: 'gentle_routine' });
  }
  // 3. Routine gaps, then whether owned products already cover them.
  const needSpf = !input.routineSteps.am.includes('protect');
  const needMoisturizer = !input.routineSteps.pm.includes('moisturize');
  if (needSpf) actions.push({ code: 'add_spf_am' });
  if (needMoisturizer) actions.push({ code: 'add_moisturizer_pm' });
  const missing: GapCategory[] = [];
  if (needSpf && !input.ownedCategories.includes('sunscreen')) missing.push('sunscreen');
  if (needMoisturizer && !input.ownedCategories.includes('moisturizer')) missing.push('moisturizer');
  // 4. Budget gates new products; a low budget gets no shopping suggestion at all.
  if (input.budget !== 'low') for (const category of missing) actions.push({ code: 'consider_product', category });
  if (!actions.some((a) => a.code === 'consider_product')) actions.push({ code: 'no_purchase_needed' });
  if (!needSpf && !needMoisturizer) actions.push({ code: 'keep_routine' });

  return { metrics, focus, actions };
}
