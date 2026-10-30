import { supabase } from '@/lib/supabase';
import { DataError } from '@/features/routine/api';
import { parseBlocks, type Block, type ChatAction } from './blocks';
import { toChatError } from './errors';

export { ChatError, chatErrorKey, type ChatErrorCode, type ChatErrorKey } from './errors';

export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; blocks: Block[]; created_at: string };
export type ActedMap = Record<string, 'applied' | 'rejected'>; // `${message_id}:${block_id}`
export type ChatThread = { id: string; origin: 'chat' | 'weekly_scan'; messages: ChatMessage[]; acted: ActedMap };

export const WINDOW = 50; // messages shown per thread

type Res<T> = { data: T; error: { code: string } | null; status: number };
function check<T>(res: Res<T>): T {
  if (res.error) throw new DataError(res.status === 0, res.error.code);
  return res.data;
}

// The requested thread, else the user's most recent one; null when they have none yet. Last WINDOW messages,
// oldest first, plus which blocks were already acted on.
export async function loadThread(userId: string, threadId: string | null): Promise<ChatThread | null> {
  let q = supabase
    .from('chat_threads')
    .select('id, origin, chat_messages(id, role, content, blocks, created_at), chat_actions(message_id, block_id, result)')
    .eq('user_id', userId);
  q = threadId ? q.eq('id', threadId) : q.order('last_message_at', { ascending: false }).limit(1);
  const row = check(await q.order('created_at', { referencedTable: 'chat_messages', ascending: false }).limit(WINDOW, { referencedTable: 'chat_messages' }).maybeSingle());
  if (!row) return null;
  const acted: ActedMap = {};
  for (const a of row.chat_actions) acted[`${a.message_id}:${a.block_id}`] = a.result === 'applied' ? 'applied' : 'rejected';
  return {
    id: row.id,
    origin: row.origin === 'weekly_scan' ? 'weekly_scan' : 'chat',
    messages: [...row.chat_messages].reverse().map((m) => ({ id: m.id, role: m.role === 'user' ? 'user' : 'assistant', content: m.content, blocks: parseBlocks(m.blocks), created_at: m.created_at })),
    acted,
  };
}

async function invokeChat<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('chat', { body, timeout: 60_000 });
  if (error) throw await toChatError(error);
  return data as T;
}

export type SendResult = { thread_id: string; messages: ChatMessage[] };
export const sendMessage = (threadId: string | null, text: string) =>
  invokeChat<SendResult>({ kind: 'message', text, ...(threadId ? { thread_id: threadId } : {}) }).then((r) => ({
    ...r,
    messages: r.messages.map((m) => ({ ...m, blocks: parseBlocks(m.blocks) })),
  }));

export type ActionResult = { result: 'applied' | 'rejected'; effect: unknown };
export const sendAction = (threadId: string, messageId: string, blockId: string, action: ChatAction) =>
  invokeChat<ActionResult>({ kind: 'action', thread_id: threadId, message_id: messageId, block_id: blockId, action });
