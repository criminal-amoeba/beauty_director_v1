import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { flushQueue, loadHome, mergeCompletions, submitCompletion, type HomeData } from './api';
import type { CompletionRow } from './completion';

export const homeKey = (userId: string) => ['home', userId] as const;

// Home and the routine screen share this query: a finished routine shows on Home without a refetch.
export function useHome() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useQuery({ queryKey: homeKey(userId), queryFn: () => loadHome(userId), enabled: !!userId });
  return { ...query, userId };
}

// Sends completions queued offline when Home gets focus or the app returns to the foreground,
// and refreshes Home on foreground (a new day may have started).
export function useCompletionSync(userId: string) {
  const client = useQueryClient();
  const sync = useCallback((refresh: boolean) => {
    if (!userId) return;
    flushQueue(userId).then(
      (sent) => {
        if (sent > 0 || refresh) client.invalidateQueries({ queryKey: homeKey(userId) });
      },
      () => {},
    );
  }, [client, userId]);

  useFocusEffect(useCallback(() => sync(false), [sync]));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && sync(true));
    return () => sub.remove();
  }, [sync]);
}

export function useSubmitCompletion(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (row: CompletionRow) => submitCompletion(row),
    onSuccess: (_result, row) => {
      client.setQueryData<HomeData>(homeKey(userId), (d) => d && { ...d, completions: mergeCompletions([row], d.completions) });
    },
  });
}
