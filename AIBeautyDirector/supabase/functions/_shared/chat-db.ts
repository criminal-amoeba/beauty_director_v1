// What the chat function needs from the database, as a small interface so the handler is tested against a fake.
// The Supabase implementation lives in chat/index.ts (Deno, service role).
import type { Llm } from './adapters/llm.ts';
import type { Action, Block } from './chat/blocks.ts';
import type { ContextData } from './context/types.ts';
import type { ProposalState, VersionSteps } from './rules/proposal.ts';

export type StoredMessage = { id: string; role: 'user' | 'assistant'; content: string; blocks: Block[]; created_at: string };
export type NewMessage = {
  user_id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  blocks: Block[];
  model?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
};
export type ApplyResult = { result: 'applied' | 'rejected'; effect: unknown } | 'forbidden' | 'already_acted' | 'invalid_action';

export type ChatDb = {
  countUserMessagesSince(userId: string, sinceIso: string): Promise<number>;
  findThread(userId: string, threadId: string): Promise<{ id: string; origin: string } | null>;
  latestChatThread(userId: string, sinceIso: string): Promise<{ id: string } | null>; // origin 'chat', active since
  createThread(userId: string): Promise<{ id: string }>;
  // One in-flight request per thread: true when this call took the busy slot (busy_until null or expired).
  claimThread(threadId: string, untilIso: string, nowIso: string): Promise<boolean>;
  releaseThread(threadId: string): Promise<void>;
  insertMessage(row: NewMessage): Promise<StoredMessage>;
  touchThread(threadId: string, atIso: string): Promise<void>;
  countThreadMessages(threadId: string): Promise<number>;
  loadContextData(userId: string, threadId: string, opts: { since30: string }): Promise<ContextData>;
  loadProposalState(userId: string): Promise<ProposalState>;
  insertCandidateRoutine(userId: string, period: 'am' | 'pm', steps: VersionSteps): Promise<{ id: string }>; // inactive, source 'system'
  saveSummary(threadId: string, summary: string, throughMessageId: string): Promise<void>;
  getMessageBlock(userId: string, threadId: string, messageId: string, blockId: string): Promise<Block | null>;
  applyAction(p: { userId: string; threadId: string; messageId: string; blockId: string; action: Action }): Promise<ApplyResult>; // rpc apply_chat_action
};

export type ChatDeps = {
  getUser(jwt: string): Promise<{ id: string } | null>;
  db: ChatDb;
  llm: Llm;
  now?: () => number;
  deadlineMs?: number;
};

export const CHAT_LIMITS = {
  maxChars: 1000,
  perHour: 30,
  busyMs: 60_000,
  threadReuseMs: 24 * 60 * 60 * 1000,
  contextMessages: 10,
  summaryEvery: 10,
  replyTokens: 4000, // max_completion_tokens of the text call; includes reasoning (medium effort)
  blockTokens: 1500, // the intents call
  summaryTokens: 300,
  budgetTokens: 9000, // whole prompt: system (character + examples ≈ 2500) + DATA sections
  maxStoredChars: 4000, // chat_messages.content check
  summaryChars: 2000, // chat_threads.summary check
} as const;
