// Chat cards as native function calls: the second LLM call gets these tools (strict JSON Schema, so the API enforces
// every argument) instead of writing free JSON. They are built per request: product names, ingredient codes and
// active reactions are enums of THIS user's values, so names always match, and a tool that cannot apply (no routine,
// no scan, no products) is not offered. The calls become intents with names only; chat/handler.ts resolves them into
// stored blocks with server-made ids. The server still validates every call: strict mode is not trusted alone.
import { z } from 'zod';
import type { ToolCall, ToolDef } from '../adapters/llm.ts';
import type { ContextData } from '../context/types.ts';
import {
  BUDGETS, CATEGORIES, GOALS, INGREDIENT_ACTIVES, KEY_ACTIVES, LEVELS, PRODUCT_STATUSES, REACTIONS, SEVERITIES, STEP_TYPES, TEXTURES, USE_TIMES,
  type Category, type StepType,
} from '../rules/actives.ts';
import { displayName } from '../rules/proposal.ts';
import { MAX_BLOCKS, MAX_OPTIONS } from './blocks.ts';

export const INGREDIENT_CODES = Object.keys(INGREDIENT_ACTIVES) as [string, ...string[]];

export type ChangeIntent = {
  type: 'change_intent';
  entity: 'skin_profile' | 'product' | 'reaction';
  field: string;
  product_name?: string;
  new_value: unknown;
  reason: string;
};
export type Intent =
  | { type: 'quick_replies'; options: string[] }
  | { type: 'choice'; question: string; options: string[] }
  | { type: 'product_mention'; name: string; brand?: string; category?: Category }
  | { type: 'show_routine'; period: 'am' | 'pm' | 'both' }
  | { type: 'new_routine'; period: 'am' | 'pm'; steps: { step_type: StepType; product_name: string | null }[]; reason: string }
  | { type: 'scan_summary' }
  | ChangeIntent;

// ── Tool definitions ────────────────────────────────────────────────────────
type Schema = Record<string, unknown>;
const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) });
const oneOf = (values: readonly string[], description?: string): Schema => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) });
const orNull = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
const list = (items: Schema, description?: string): Schema => ({ type: 'array', items, ...(description ? { description } : {}) });
const obj = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const tool = (name: string, description: string, properties: Record<string, Schema>): ToolDef => ({ name, description, parameters: obj(properties) });

const REASON = str("One short sentence for the user, in DATA.language, plain appearance words, never medical terms.");
const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

export type ToolData = Pick<ContextData, 'products' | 'routines' | 'reactions' | 'scans'>;
export const productNames = (d: ToolData) => uniq(d.products.map(displayName));
// What a recorded reaction is called: its ingredient code, else the product's name.
export const reactionTargets = (d: ToolData) =>
  uniq(d.reactions.map((r) => {
    if (r.ingredient) return r.ingredient;
    const p = d.products.find((x) => x.id === r.product_id);
    return p ? displayName(p) : null;
  }));

export function buildTools(d: ToolData): ToolDef[] {
  const names = productNames(d);
  const product = names.length ? oneOf(names, 'Exactly as listed in DATA products.') : null;
  const targets = reactionTargets(d);
  const tools: ToolDef[] = [
    tool('suggest_replies', "Tappable follow-ups when the reply ends with something the user could naturally say or ask next. 2-4 options in DATA.language, each at most 6 words, written as the user would say them (e.g. Show my routine), never advice. Never actions the app cannot do (no reminders, plans, schedules or follow-ups).", {
      options: list(str()),
    }),
    tool('ask_choice', 'When the reply asks the user to pick between named options (2-4).', {
      question: str(),
      options: list(str()),
    }),
    tool('show_product', 'For a product the user named in new_message, exactly as they wrote it, even if the reply advises against using it. The app offers to add it, or opens it if they already own it.', {
      name: str(),
      brand: orNull(str()),
      category: orNull(oneOf(CATEGORIES)),
    }),
  ];
  if (d.routines.length) {
    tools.push(
      tool('show_routine', 'Only when the user asks to see or look at their routine. Shows the routine as it is saved. Not for questions about what to do or change.', {
        period: oneOf(['am', 'pm', 'both']),
      }),
      tool('new_routine', "When the reply suggests changing the AM or PM routine: adding, removing, reordering or simplifying steps. period = the routine the user or reply is talking about. List the WHOLE routine as it should be after the change, starting from the user's routine in DATA; each product at most once. When the user wants fewer steps, the new list has fewer steps than now. The app shows before/after and the user accepts or declines.", {
        period: oneOf(['am', 'pm'], 'am = morning routine; pm = evening / night / bedtime routine.'),
        steps: list(obj({ step: oneOf(STEP_TYPES), product: product ? orNull(product) : { type: 'null' } }), 'Every step of the new routine, in order. product = one of their products, or null for a step without one.'),
        reason: REASON,
      }),
    );
  }
  if (d.scans.length) tools.push(tool('show_scan', 'When the user asks about their check-in, scan or results, or the reply discusses the check-in numbers.', {}));
  tools.push(
    tool('update_skin_profile', 'When the user states something the app stores about them: budget, routine experience, skin goals or preferred textures. Set only what they said; null for the rest.', {
      budget: orNull(oneOf(BUDGETS)),
      routine_level: orNull(oneOf(LEVELS)),
      goals: orNull(list(oneOf(GOALS))),
      textures: orNull(list(oneOf(TEXTURES))),
      reason: REASON,
    }),
  );
  if (product) {
    tools.push(
      tool('update_product', 'When the user says something about a product they own: paused or finished it (status), when they use it, its key ingredients, or the date they opened it (YYYY-MM-DD). Null for anything they did not say.', {
        product,
        status: orNull(oneOf(PRODUCT_STATUSES)),
        use_time: orNull(oneOf(USE_TIMES)),
        opened_at: orNull(str('YYYY-MM-DD')),
        key_actives: orNull(list(oneOf(KEY_ACTIVES))),
        reason: REASON,
      }),
    );
  }
  tools.push(
    tool('log_reaction', 'When the user reports their skin reacting to one of their products or to an ingredient (stinging, redness, breakouts, dryness, itching). product only if the user named that product; ingredient only if they named the ingredient.', {
      product: product ? orNull(product) : { type: 'null' },
      ingredient: orNull(oneOf(INGREDIENT_CODES)),
      reaction: oneOf(REACTIONS),
      severity: oneOf(SEVERITIES),
      reason: REASON,
    }),
  );
  if (targets.length) {
    tools.push(tool('resolve_reaction', 'When the user says a recorded reaction has gone away.', { target: oneOf(targets), reason: REASON }));
  }
  return tools;
}

// ── Tool calls → intents ────────────────────────────────────────────────────
const label = z.string().trim().min(1).max(60);
const reasonText = z.string().trim().max(200);
const options = (min: number) => z.array(label).min(min).transform((o) => o.slice(0, MAX_OPTIONS));
const nameText = z.string().trim().min(1).max(201);

const ARGS = {
  suggest_replies: z.object({ options: options(1) }),
  ask_choice: z.object({ question: z.string().trim().min(1).max(200), options: options(2) }),
  show_product: z.object({ name: z.string().trim().min(1).max(120), brand: z.string().trim().max(80).nullish(), category: z.enum(CATEGORIES).nullish() }),
  show_routine: z.object({ period: z.enum(['am', 'pm', 'both']) }),
  new_routine: z.object({
    period: z.enum(['am', 'pm']),
    steps: z.array(z.object({ step: z.enum(STEP_TYPES), product: nameText.nullish() })).min(1).max(20),
    reason: reasonText,
  }),
  show_scan: z.object({}),
  update_skin_profile: z.object({
    budget: z.enum(BUDGETS).nullish(),
    routine_level: z.enum(LEVELS).nullish(),
    goals: z.array(z.enum(GOALS)).nullish(),
    textures: z.array(z.enum(TEXTURES)).nullish(),
    reason: reasonText,
  }),
  update_product: z.object({
    product: nameText,
    status: z.enum(PRODUCT_STATUSES).nullish(),
    use_time: z.enum(USE_TIMES).nullish(),
    opened_at: z.string().nullish(),
    key_actives: z.array(z.enum(KEY_ACTIVES)).nullish(),
    reason: reasonText,
  }),
  log_reaction: z.object({
    product: nameText.nullish(),
    ingredient: z.enum(INGREDIENT_CODES).nullish(),
    reaction: z.enum(REACTIONS),
    severity: z.enum(SEVERITIES),
    reason: reasonText,
  }),
  resolve_reaction: z.object({ target: nameText, reason: reasonText }),
};
type ToolName = keyof typeof ARGS;
type Args<N extends ToolName> = z.infer<(typeof ARGS)[N]>;

// One field per change card; null/absent fields mean "the user did not say".
const changes = (entity: ChangeIntent['entity'], values: Record<string, unknown>, reason: string, product_name?: string): ChangeIntent[] =>
  Object.entries(values).flatMap(([field, v]) =>
    v === null || v === undefined ? [] : [{ type: 'change_intent', entity, field, new_value: v, reason, ...(product_name ? { product_name } : {}) }]);

function toIntents(name: ToolName, a: Args<ToolName>): Intent[] {
  switch (name) {
    case 'suggest_replies': return [{ type: 'quick_replies', options: (a as Args<'suggest_replies'>).options }];
    case 'ask_choice': { const x = a as Args<'ask_choice'>; return [{ type: 'choice', question: x.question, options: x.options }]; }
    case 'show_product': {
      const x = a as Args<'show_product'>;
      return [{ type: 'product_mention', name: x.name, ...(x.brand ? { brand: x.brand } : {}), ...(x.category ? { category: x.category } : {}) }];
    }
    case 'show_routine': return [{ type: 'show_routine', period: (a as Args<'show_routine'>).period }];
    case 'new_routine': {
      const x = a as Args<'new_routine'>;
      return [{ type: 'new_routine', period: x.period, steps: x.steps.map((s) => ({ step_type: s.step, product_name: s.product ?? null })), reason: x.reason }];
    }
    case 'show_scan': return [{ type: 'scan_summary' }];
    case 'update_skin_profile': { const { reason, ...v } = a as Args<'update_skin_profile'>; return changes('skin_profile', v, reason); }
    case 'update_product': { const { reason, product, ...v } = a as Args<'update_product'>; return changes('product', v, reason, product); }
    case 'log_reaction': {
      const x = a as Args<'log_reaction'>;
      if (!x.product && !x.ingredient) return [];
      const value = { ...(x.product ? { product_name: x.product } : {}), ...(x.ingredient ? { ingredient: x.ingredient } : {}), reaction: x.reaction, severity: x.severity };
      return [{ type: 'change_intent', entity: 'reaction', field: 'new', new_value: value, reason: x.reason }];
    }
    case 'resolve_reaction': {
      const x = a as Args<'resolve_reaction'>;
      return [{ type: 'change_intent', entity: 'reaction', field: 'resolved_at', product_name: x.target, new_value: null, reason: x.reason }];
    }
  }
}

// Unknown tools, unparseable or invalid arguments are dropped one call at a time. At most one new_routine per period;
// at most MAX_BLOCKS intents in total.
export function parseToolCalls(calls: readonly ToolCall[]): Intent[] {
  const out: Intent[] = [];
  for (const c of calls) {
    if (!Object.prototype.hasOwnProperty.call(ARGS, c.name)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(c.arguments || '{}');
    } catch {
      continue;
    }
    const r = ARGS[c.name as ToolName].safeParse(raw);
    if (!r.success) continue;
    for (const i of toIntents(c.name as ToolName, r.data)) {
      if (i.type === 'new_routine' && out.some((o) => o.type === 'new_routine' && o.period === i.period)) continue;
      out.push(i);
    }
  }
  return out.slice(0, MAX_BLOCKS);
}

// The model links an ingredient reaction to an owned product the user never named ("vitamin C stings" → their
// serum). With an ingredient given, keep the product only when new_message names it.
export function dropUnnamedReactionProduct(intents: Intent[], newMessage: string, d: Pick<ToolData, 'products'>): Intent[] {
  const msg = newMessage.toLowerCase();
  return intents.map((i) => {
    if (i.type !== 'change_intent' || i.entity !== 'reaction' || i.field !== 'new') return i;
    const v = i.new_value as { product_name?: string; ingredient?: string };
    if (!v.product_name || !v.ingredient) return i;
    const p = d.products.find((x) => displayName(x) === v.product_name);
    if (p && (msg.includes(p.name.toLowerCase()) || msg.includes(displayName(p).toLowerCase()))) return i;
    const { product_name: _, ...rest } = v;
    return { ...i, new_value: rest };
  });
}

// Every string the user could see from one intent, for the safety filter.
export function intentStrings(i: Intent): string[] {
  switch (i.type) {
    case 'quick_replies': return i.options;
    case 'choice': return [i.question, ...i.options];
    case 'product_mention': return [i.name, i.brand ?? ''].filter(Boolean);
    case 'new_routine': return [i.reason].filter(Boolean);
    case 'change_intent': return [i.reason, i.product_name ?? '', typeof i.new_value === 'string' ? i.new_value : ''].filter(Boolean);
    default: return [];
  }
}
