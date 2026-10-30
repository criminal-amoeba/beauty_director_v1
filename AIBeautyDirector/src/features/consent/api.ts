import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { PURPOSES, isOneOf } from '@/features/onboarding/codes';
import type { ConsentRow, Consents } from './change';
import { DataError } from '@/features/routine/api';

export { consentChange, type ConsentRow, type Consents, type ConsentState } from './change';

export const consentsKey = (userId: string) => ['consents', userId] as const;

export async function loadConsents(userId: string): Promise<Consents> {
  const res = await supabase.from('current_consents').select('purpose, granted, policy_version, created_at').eq('user_id', userId);
  if (res.error || !res.data) throw new DataError(res.status === 0, res.error?.code);
  const out: Consents = {};
  for (const r of res.data) {
    if (isOneOf(PURPOSES, r.purpose) && r.granted !== null && r.policy_version && r.created_at) {
      out[r.purpose] = { granted: r.granted, policy_version: r.policy_version, created_at: r.created_at };
    }
  }
  return out;
}

export function useConsents() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useQuery({ queryKey: consentsKey(userId), queryFn: () => loadConsents(userId), enabled: !!userId });
  return { ...query, userId };
}

export function useSaveConsent(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (row: ConsentRow) => {
      const res = await supabase.from('consents').insert(row);
      if (res.error) throw new DataError(res.status === 0, res.error.code);
    },
    onSuccess: (_r, row) => client.setQueryData<Consents>(consentsKey(userId), (c) => c && {
      ...c, [row.purpose]: { granted: row.granted, policy_version: row.policy_version, created_at: new Date().toISOString() },
    }),
  });
}
