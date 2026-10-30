import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Answers, ReactionAnswer, SaveError } from '@/features/onboarding/api';
import { homeKey } from '@/features/routine/hooks';
import { useAuth } from '@/lib/auth-context';
import { loadProfile, saveReactions, saveSection, type Section } from './api';

export const profileKey = (userId: string) => ['profile', userId] as const;

export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const query = useQuery({ queryKey: profileKey(userId), queryFn: () => loadProfile(userId), enabled: !!userId });
  return { ...query, userId, user: session?.user ?? null };
}

// Save errors are values (SaveError | null), like onboarding; a thrown error is a bug, not a form state.
export function useSaveProfile(userId: string) {
  const client = useQueryClient();
  const done = () => {
    client.invalidateQueries({ queryKey: profileKey(userId) });
    client.invalidateQueries({ queryKey: homeKey(userId) });
  };
  return useMutation({
    mutationFn: async (p: { section: Section; answers: Answers } | { section: 'reactions'; saved: ReactionAnswer[]; next: ReactionAnswer[] }): Promise<SaveError | null> =>
      p.section === 'reactions' ? saveReactions(userId, p.saved, p.next) : saveSection(userId, p.section, p.answers),
    onSuccess: (err) => { if (!err) done(); },
  });
}
