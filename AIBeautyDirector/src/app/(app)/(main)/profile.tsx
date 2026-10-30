import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight, KeyRound, Link2, Package, Sparkles, UserRound, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, Card, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { useProfile } from '@/features/profile/hooks';
import { SHOW_ACCOUNT_LINKING } from '@/lib/flags';
import { isOffline } from '@/features/routine/api';
import { useTheme } from '@/theme/useTheme';

function Row({ icon: Icon, title, subtitle, href }: { icon: LucideIcon; title: string; subtitle: string; href: Href }) {
  const router = useRouter();
  const { colors, space } = useTheme();
  return (
    <Card onPress={() => router.push(href)} accessibilityLabel={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Icon size={22} color={colors.primary} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="label">{title}</Text>
          <Text variant="caption" color="textMuted">{subtitle}</Text>
        </View>
        <ChevronRight size={20} color={colors.textMuted} />
      </View>
    </Card>
  );
}

// Profile hub: who you are, what your Beauty Director knows, and how you sign in.
export default function ProfileScreen() {
  const { t } = useTranslation();
  const { space } = useTheme();
  const { data, error, isPending, refetch, isRefetching } = useProfile();

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton width="60%" height={space.xxl} />
        <Skeleton height={space.xxxl + space.lg} />
        <Skeleton height={space.xxxl + space.lg} />
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
    <Screen edges={['bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={data.basics.name} size="lg" />
        <Text variant="h1" style={{ flex: 1 }} numberOfLines={2}>{data.basics.name || t('profile.title')}</Text>
      </View>
      <Row icon={UserRound} title={t('profile.basics')} subtitle={t('profile.basicsSubtitle')} href="/profile-basics" />
      <Row icon={Sparkles} title={t('profile.skin')} subtitle={t('profile.skinSubtitle')} href="/skin-profile" />
      <Row icon={Package} title={t('profile.products')} subtitle={t('profile.productsSubtitle')} href="/products" />
      <Row icon={KeyRound} title={t('profile.password')} subtitle={t('profile.passwordSubtitle')} href="/profile-password" />
      {SHOW_ACCOUNT_LINKING && <Row icon={Link2} title={t('profile.methods')} subtitle={t('profile.methodsSubtitle')} href="/profile-methods" />}
    </Screen>
  );
}
