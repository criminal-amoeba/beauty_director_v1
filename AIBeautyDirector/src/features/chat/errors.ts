import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

// Error codes the chat function returns (supabase/functions/_shared/codes.ts) plus client-side ones.
// Pure module (no supabase client import) so it can be unit-tested without env.
export const CHAT_ERROR_CODES = [
  'unauthorized', 'invalid_request', 'message_too_long', 'rate_limited', 'thread_busy', 'forbidden', 'already_acted',
  'block_not_found', 'action_mismatch', 'invalid_action', 'db_failed', 'llm_not_configured', 'provider_failed', 'provider_timeout',
  'offline', 'unknown',
] as const;
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];
export type ChatErrorKey = 'offline' | 'generic' | 'rate_limited' | 'thread_busy' | 'message_too_long' | 'already_acted' | 'unavailable' | 'timeout';

export class ChatError extends Error {
  constructor(readonly code: ChatErrorCode, readonly status?: number) {
    super(code);
  }
}

// Which `chat.errors.<key>` explains a code to the user.
export function chatErrorKey(code: ChatErrorCode): ChatErrorKey {
  switch (code) {
    case 'offline':
    case 'rate_limited':
    case 'thread_busy':
    case 'message_too_long':
    case 'already_acted':
      return code;
    case 'llm_not_configured':
    case 'provider_failed':
      return 'unavailable';
    case 'provider_timeout':
      return 'timeout';
    default:
      return 'generic';
  }
}

const isCode = (v: unknown): v is ChatErrorCode => (CHAT_ERROR_CODES as readonly unknown[]).includes(v);

export async function toChatError(error: unknown): Promise<ChatError> {
  if (error instanceof ChatError) return error;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response | undefined;
    const body = (await res?.json().catch(() => null)) as { error?: unknown } | null;
    return new ChatError(isCode(body?.error) ? body.error : 'unknown', res?.status);
  }
  if (error instanceof FunctionsFetchError) return new ChatError('offline');
  return new ChatError('unknown');
}

