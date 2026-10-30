// Structured chat blocks (step 10 §C): what is STORED on chat_messages.blocks and rendered by the app. Every id
// in here (block ids, product ids, candidate routine ids) is made or resolved by the server; the LLM only ever
// emits intents (see llm-output.ts). The app keeps a copy of this schema (src/features/chat/blocks.ts) and a
// test asserts both agree.
import { z } from 'zod';
import { CATEGORIES, KEY_ACTIVES, STEP_TYPES, USE_TIMES } from '../rules/actives.ts';

export const MAX_BLOCKS = 3;
export const MAX_OPTIONS = 4;

const blockId = z.string().regex(/^b\d{1,2}$/);
const label = z.string().trim().min(1).max(60);
const option = z.object({ id: z.string().regex(/^o\d{1,2}$/), label });
const diffStep = z.object({ step_type: z.enum(STEP_TYPES), product_name: z.string().max(201).nullable(), position: z.number().int().min(1).max(20) });
export const DiffSchema = z.object({ added: z.array(diffStep), removed: z.array(diffStep), moved: z.array(diffStep) });

export const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quick_replies'), id: blockId, options: z.array(option).min(1).max(MAX_OPTIONS) }),
  z.object({ type: z.literal('choice'), id: blockId, question: z.string().trim().min(1).max(200), options: z.array(option).min(2).max(MAX_OPTIONS) }),
  z.object({
    type: z.literal('product_card'), id: blockId, mode: z.enum(['owned', 'suggest_add']), product_id: z.uuid().nullable(),
    name: z.string().trim().min(1).max(120), brand: z.string().max(80).nullable(), category: z.enum(CATEGORIES).nullable(),
  }),
  z.object({ type: z.literal('routine_proposal'), id: blockId, candidate_routine_id: z.uuid(), period: z.enum(['am', 'pm']), diff: DiffSchema, reason: z.string().max(200) }),
  z.object({
    type: z.literal('confirm_change'), id: blockId, entity: z.enum(['skin_profile', 'product', 'reaction']), row_id: z.uuid().nullable(),
    field: z.string().max(40), new_value: z.unknown(), label: z.string().max(120), reason: z.string().max(200),
  }),
  z.object({
    type: z.literal('scan_summary'), id: blockId, scan_id: z.uuid(), date: z.string(),
    metrics: z.array(z.object({ label: z.string(), value: z.number(), trend: z.enum(['up', 'down', 'flat']).nullable() })).max(12),
  }),
]);
export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block['type'];

// Lenient read of stored blocks: unknown or malformed entries are dropped, never thrown on.
export function parseBlocks(v: unknown): Block[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((b) => { const r = BlockSchema.safeParse(b); return r.success ? [r.data] : []; });
}

export const ProductInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).nullable().optional(),
  category: z.enum(CATEGORIES),
  use_time: z.enum(USE_TIMES).default('both'),
  key_actives: z.array(z.enum(KEY_ACTIVES)).max(KEY_ACTIVES.length).default([]),
  ingredients_text: z.string().trim().max(2000).nullable().optional(),
  opened_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add_product'), product: ProductInputSchema }),
  z.object({ type: z.enum(['accept_routine', 'decline_routine', 'confirm_change', 'decline_change']) }),
]);
export type Action = z.infer<typeof ActionSchema>;

// Which taps a block type accepts; quick_replies and choice are render-only (a tap sends a normal message).
export const ACTIONS_FOR_BLOCK: Readonly<Record<BlockType, readonly Action['type'][]>> = {
  quick_replies: [],
  choice: [],
  product_card: ['add_product'],
  routine_proposal: ['accept_routine', 'decline_routine'],
  confirm_change: ['confirm_change', 'decline_change'],
  scan_summary: [],
};
