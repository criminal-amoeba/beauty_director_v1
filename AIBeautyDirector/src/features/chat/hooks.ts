import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productsKey } from '@/features/products/api';
import { homeKey } from '@/features/routine/hooks';
import { useAuth } from '@/lib/auth-context';
import { ChatError, loadThread, sendAction, sendMessage, type ChatThread } from './api';
import type { ChatAction } from './blocks';

export const chatKey = (userId: string, threadId: string | null) => ['chat', userId, threadId] as const;

export function useThread(threadId: string | null) {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useQuery({ queryKey: chatKey(userId, threadId), queryFn: () => loadThread(userId, threadId), enabled: !!userId });
  return { ...query, userId };
}

// `keyThreadId` is the id the screen's query was made with (null = "latest thread", opened from Home);
// `threadId` is the thread the request goes to (the loaded thread's id). The pair is appended under the
// screen's key; when the server picked or created another thread, the chat queries are refetched instead.
export function useSendMessage(userId: string, keyThreadId: string | null, threadId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => sendMessage(threadId, text),
    onSuccess: (r) => {
      const key = chatKey(userId, keyThreadId);
      const current = client.getQueryData<ChatThread | null>(key);
      if (current && current.id === r.thread_id) {
        const next: ChatThread = { ...current, messages: [...current.messages, ...r.messages] };
        client.setQueryData<ChatThread | null>(key, next);
      } else {
        client.invalidateQueries({ queryKey: ['chat', userId] });
      }
    },
  });
}

// A second tap on an already-applied block (409) counts as success: the first tap did the work.
export function useSendAction(userId: string, keyThreadId: string | null, threadId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (p: { messageId: string; blockId: string; action: ChatAction }) => {
      try {
        return await sendAction(threadId!, p.messageId, p.blockId, p.action);
      } catch (e) {
        if (e instanceof ChatError && e.code === 'already_acted') return { result: 'applied' as const, effect: null };
        throw e;
      }
    },
    onSuccess: (r, p) => {
      client.setQueryData<ChatThread | null>(chatKey(userId, keyThreadId), (t) => t && { ...t, acted: { ...t.acted, [`${p.messageId}:${p.blockId}`]: r.result } });
      client.invalidateQueries({ queryKey: homeKey(userId) });
      client.invalidateQueries({ queryKey: productsKey(userId) });
    },
  });
}
