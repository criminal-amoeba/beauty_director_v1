// What the second ("blocks") LLM call may say: {"blocks": [...]} of INTENTS with names, never ids. The chat
// function resolves intents into stored blocks (blocks.ts). Anything malformed degrades to no blocks; the
// safety check runs on every string of every block before anything is stored, and a failing block is dropped.
import { z } from 'zod';
import { CATEGORIES, STEP_TYPES } from '../rules/actives.ts';
import { MAX_BLOCKS, MAX_OPTIONS } from './blocks.ts';

const label = z.string().trim().min(1).max(60);
const reason = z.string().trim().max(200);

export const LlmBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quick_replies'), options: z.array(label).min(1).max(MAX_OPTIONS) }),
  z.object({ type: z.literal('choice'), question: z.string().trim().min(1).max(200), options: z.array(label).min(2).max(MAX_OPTIONS) }),
  z.object({ type: z.literal('product_mention'), name: z.string().trim().min(1).max(120), brand: z.string().trim().max(80).optional(), category: z.enum(CATEGORIES).optional() }),
  z.object({
    type: z.literal('routine_intent'), kind: z.enum(['add', 'remove', 'reorder', 'simplify']), period: z.enum(['am', 'pm']),
    product_name: z.string().trim().max(120).optional(), step_type: z.enum(STEP_TYPES).optional(), reason,
  }),
  z.object({
    type: z.literal('change_intent'), entity: z.enum(['skin_profile', 'product', 'reaction']), field: z.string().trim().max(40),
    product_name: z.string().trim().max(120).optional(), new_value: z.unknown(), reason,
  }),
  z.object({ type: z.literal('scan_summary') }),
]);
export type LlmBlock = z.infer<typeof LlmBlockSchema>;

const stripFences = (s: string) => s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

// {"blocks": [...]} or a bare array. Invalid JSON or shape → []. Blocks are validated one by one: the good ones
// survive, capped at MAX_BLOCKS.
export function parseLlmBlocks(raw: string): LlmBlock[] {
  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw));
  } catch {
    return [];
  }
  const list = Array.isArray(json) ? json : json && typeof json === 'object' ? (json as { blocks?: unknown }).blocks : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((b) => { const r = LlmBlockSchema.safeParse(b); return r.success ? [r.data] : []; }).slice(0, MAX_BLOCKS);
}

// Every string the user could see in one block, for the safety filter.
export function blockStrings(b: LlmBlock): string[] {
  switch (b.type) {
    case 'quick_replies': return b.options;
    case 'choice': return [b.question, ...b.options];
    case 'product_mention': return [b.name, b.brand ?? ''].filter(Boolean);
    case 'routine_intent': return [b.reason, b.product_name ?? ''].filter(Boolean);
    case 'change_intent': return [b.reason, b.product_name ?? '', typeof b.new_value === 'string' ? b.new_value : ''].filter(Boolean);
    default: return [];
  }
}
