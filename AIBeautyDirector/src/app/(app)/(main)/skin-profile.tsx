import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Card, Chip, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import type { Answers } from '@/features/onboarding/api';
import { SKIN_SECTIONS, type SkinSection } from '@/features/profile/api';
import { useProfile } from '@/features/profile/hooks';
import { isOffline } from '@/features/routine/api';
import { useTheme } from '@/theme/useTheme';

// What the Beauty Director knows about the user's skin, one card per onboarding section; tap to edit.
export default function SkinProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const { data, error, isPending, refetch, isRefetching } = useProfile();

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton height={space.xxxl * 2} />
        <Skeleton height={space.xxxl * 2} />
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

  const chips = (a: Answers, section: SkinSection): string[] => {
    switch (section) {
      case 'goals': return a.goals.map((g) => t(`codes.goal.${g}`));
      case 'level': return a.level ? [t(`codes.level.${a.level}`)] : [];
      case 'budget': return [...(a.budget ? [t(`codes.budget.${a.budget}`)] : []), ...a.textures.map((x) => t(`codes.texture.${x}`))];
      case 'reactions': return a.reactions.map((r) => t(`codes.ingredient.${r.ingredient}`));
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Text variant="h1">{t('skinProfile.title')}</Text>
      <Text color="textMuted">{t('skinProfile.subtitle')}</Text>
      {SKIN_SECTIONS.map((section) => {
        const items = chips(data, section);
        return (
          <Card key={section} onPress={() => router.push({ pathname: '/skin-profile-edit', params: { section } })} accessibilityLabel={t('skinProfile.edit', { section: t(`onboarding.steps.${section}.title`) })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Text variant="label" style={{ flex: 1 }}>{t(`onboarding.steps.${section}.title`)}</Text>
              <ChevronRight size={20} color={colors.textMuted} />
            </View>
            {items.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {items.map((label) => <Chip key={label} label={label} size="sm" />)}
              </View>
            ) : (
              <Text variant="caption" color="textMuted">{t('skinProfile.none')}</Text>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
