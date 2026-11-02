import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { BudgetStep, GoalsStep, LevelStep } from '@/components/onboarding/PreferenceSteps';
import { ReactionsStep } from '@/components/onboarding/ReactionsStep';
import { isOneOf } from '@/features/onboarding/codes';
import type { SaveError } from '@/features/onboarding/api';
import { SKIN_SECTIONS } from '@/features/profile/api';
import { useProfile, useSaveProfile } from '@/features/profile/hooks';
import { isOffline } from '@/features/routine/api';
import { useTheme } from '@/theme/useTheme';

// /skin-profile-edit?section=goals|level|budget|reactions: the onboarding step for that section, saved with the
// same writers (reactions are resolved, not deleted). Back returns to the overview.
export default function SkinProfileEditScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
  const { section: param } = useLocalSearchParams<{ section?: string }>();
  const section = isOneOf(SKIN_SECTIONS, param) ? param : 'goals';
  const { data, error, isPending, refetch, isRefetching, userId } = useProfile();
  const save = useSaveProfile(userId);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState offline={isOffline(error)} onRetry={() => refetch()} retrying={isRefetching} retryLabel={t('common.retry')} />
      </Screen>
    );
  }

  const opts = { onSuccess: (err: SaveError | null) => { setSaveError(err); if (!err) router.back(); }, onError: () => setSaveError('auth.errors.generic') };
  const props = { saving: save.isPending, error: saveError };
  return (
    <Screen edges={['bottom']} scroll={false}>
      <View style={{ gap: space.xs }}>
        <Text variant="h1">{t(`onboarding.steps.${section}.title`)}</Text>
        <Text color="textMuted">{t(`onboarding.steps.${section}.subtitle`)}</Text>
      </View>
      <View style={{ flex: 1, gap: space.lg }}>
        {section === 'goals' && <GoalsStep initial={data.goals} onSubmit={(goals) => save.mutate({ section, answers: { ...data, goals } }, opts)} {...props} />}
        {section === 'level' && <LevelStep initial={data.level} onSubmit={(level) => save.mutate({ section, answers: { ...data, level } }, opts)} {...props} />}
        {section === 'budget' && (
          <BudgetStep initial={{ budget: data.budget, textures: data.textures }} onSubmit={(v) => save.mutate({ section, answers: { ...data, ...v } }, opts)} {...props} />
        )}
        {section === 'reactions' && (
          <ReactionsStep initial={data.reactions} onSubmit={(next) => save.mutate({ section, saved: data.reactions, next }, opts)} {...props} />
        )}
      </View>
    </Screen>
  );
}
