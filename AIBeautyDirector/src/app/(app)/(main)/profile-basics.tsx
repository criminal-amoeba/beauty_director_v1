import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { BasicsStep } from '@/components/onboarding/BasicsStep';
import type { SaveError } from '@/features/onboarding/api';
import { useProfile, useSaveProfile } from '@/features/profile/hooks';
import { isOffline } from '@/features/routine/api';
import { useTheme } from '@/theme/useTheme';

// Name, birth date and gender: the onboarding step, hosted the same way (title fixed, content scrolls).
export default function ProfileBasicsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
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

  return (
    <Screen edges={['bottom']} scroll={false}>
      <Text variant="h1">{t('profile.basics')}</Text>
      <View style={{ flex: 1, gap: space.lg }}>
        <BasicsStep
          initial={data.basics}
          saving={save.isPending}
          error={saveError}
          onSubmit={(basics) =>
            save.mutate({ section: 'basics', answers: { ...data, basics } }, {
              onSuccess: (err) => { setSaveError(err); if (!err) router.back(); },
              onError: () => setSaveError('auth.errors.generic'),
            })
          }
        />
      </View>
    </Screen>
  );
}
