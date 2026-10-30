import { z } from 'zod';
import { CATEGORIES } from '@/features/onboarding/codes';
import { STEP_TYPES } from '@/features/routine/steps';

// App copy of supabase/functions/_shared/chat/blocks.ts (Metro must not import the functions folder). A Jest test
// asserts the two schemas produce the same JSON Schema, so they cannot drift. Unknown or malformed blocks are
// dropped on read: the app never renders a block type it does not know.
const blockId = z.string().regex(/^b\d{1,2}$/);
const label = z.string().trim().min(1).max(60);
const option = z.object({ id: z.string().regex(/^o\d{1,2}$/), label });
const diffStep = z.object({ step_type: z.enum(STEP_TYPES), product_name: z.string().max(201).nullable(), position: z.number().int().min(1).max(20) });
export const DiffSchema = z.object({ added: z.array(diffStep), removed: z.array(diffStep), moved: z.array(diffStep) });

export const BlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('quick_replies'), id: blockId, options: z.array(option).min(1).max(4) }),
  z.object({ type: z.literal('choice'), id: blockId, question: z.string().trim().min(1).max(200), options: z.array(option).min(2).max(4) }),
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
export type DiffStep = z.infer<typeof DiffSchema>['added'][number];

export function parseBlocks(v: unknown): Block[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((b) => { const r = BlockSchema.safeParse(b); return r.success ? [r.data] : []; });
}

// What a tap sends to the chat function for a block (quick_replies / choice send a plain message instead).
export type ChatAction =
  | { type: 'accept_routine' | 'decline_routine' | 'confirm_change' | 'decline_change' }
  | { type: 'add_product'; product: Record<string, unknown> };
