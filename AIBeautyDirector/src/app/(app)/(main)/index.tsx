import { View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Camera, MessageCircle, Sprout } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, ErrorState, Pill, PressableScale, Screen, Skeleton, Text } from '@/components/ui';
import { RoutineCard } from '@/components/home/RoutineCard';
import { ScanCard } from '@/components/home/ScanCard';
import { isOffline } from '@/features/routine/api';
import { localHour, periodNow, routineDate } from '@/features/routine/dates';
import { useCompletionSync, useHome } from '@/features/routine/hooks';
import { PERIODS } from '@/features/routine/steps';
import { computeStreak } from '@/features/routine/streak';
import { useNow } from '@/lib/use-now';
import { useTheme } from '@/theme/useTheme';
import { SHOW_CAMERA_TEST } from '@/lib/flags';

const greetingFor = (hour: number) => (hour >= 4 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening');

// Home: greeting + streak, Weekly Scan, AM/PM, Chat. Every destination is pushed on top of this screen.
export default function HomeScreen() {
  const router = useRouter();
  const drawer = useNavigation<{ openDrawer: () => void }>('/(app)');
  const { t } = useTranslation();
  const { colors, space, layout } = useTheme();
  const { data, error, isPending, refetch, isRefetching, userId } = useHome();
  useCompletionSync(userId);
  const now = useNow(60_000); // the hour and "today" roll over while Home stays open

  if (isPending) return <HomeSkeleton />;
  if (!data) {
    return (
      <Screen>
        <ErrorState
          offline={isOffline(error)}
          onRetry={() => refetch()}
          retrying={isRefetching}
          title={isOffline(error) ? undefined : t('error.title')}
          message={isOffline(error) ? undefined : t('error.message')}
          retryLabel={t('common.retry')}
        />
      </Screen>
    );
  }

  const hour = localHour(now, data.tz);
  const today = routineDate(now, data.tz);
  const current = periodNow(hour);
  const streak = computeStreak(data.completions.map((c) => c.local_date), today);
  const greeting = t(`home.greeting.${greetingFor(hour)}`);
  const streakLabel = streak.days > 0
    ? t('home.streak.days', { count: streak.days })
    : t(data.completions.length > 0 ? 'home.streak.restart' : 'home.streak.start');

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <View style={{ flex: 1, gap: space.xs }}>
          {data.name ? (
            <>
              <Text color="textMuted">{greeting}</Text>
              <Text variant="display">{data.name}</Text>
            </>
          ) : (
            <Text variant="display">{greeting}</Text>
          )}
        </View>
        <PressableScale
          onPress={() => drawer.openDrawer()}
          accessibilityRole="button"
          accessibilityLabel={t('home.openMenu')}
          hitSlop={space.xs}
          style={{ minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' }}>
          <Avatar name={data.name ?? ''} />
        </PressableScale>
      </View>

      <View style={{ gap: space.xs }}>
        <Pill icon={Sprout} tone="primary" label={streakLabel} />
        {streak.days > 0 && streak.welcomeBack && <Text variant="caption" color="textMuted">{t('home.streak.welcomeBack')}</Text>}
      </View>

      {error && isOffline(error) && <Text variant="caption" color="textMuted">{t('home.offline')}</Text>}

      <ScanCard lastScanAt={data.lastScanAt} tz={data.tz} onStart={() => router.push('/scan')} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {PERIODS.map((p) => (
          <RoutineCard
            key={p}
            period={p}
            routine={data.routines[p]}
            completion={data.completions.find((c) => c.period === p && c.local_date === today)}
            highlighted={p === current}
            onPress={() => router.push(`/routine/${p}`)}
          />
        ))}
      </View>

      <Card onPress={() => router.push('/chat')} accessibilityLabel={t('home.chat.title')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <MessageCircle size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text variant="label">{t('home.chat.title')}</Text>
            <Text variant="caption" color="textMuted">{t('home.chat.subtitle')}</Text>
          </View>
        </View>
      </Card>

      {__DEV__ && SHOW_CAMERA_TEST && <Button title={t('home.cameraTest.title')} variant="ghost" icon={Camera} onPress={() => router.push('/camera-test')} />}
    </Screen>
  );
}

function HomeSkeleton() {
  const { space, radii } = useTheme();
  return (
    <Screen>
      <View style={{ gap: space.sm }}>
        <Skeleton width="35%" />
        <Skeleton width="60%" height={space.xxl + space.sm} />
      </View>
      <Skeleton width="40%" height={space.xl} radius={radii.full} />
      <Skeleton height={space.xxxl * 4} radius={radii.md} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ flex: 1 }}><Skeleton height={space.xxxl * 3} radius={radii.md} /></View>
        <View style={{ flex: 1 }}><Skeleton height={space.xxxl * 3} radius={radii.md} /></View>
      </View>
      <Skeleton height={space.xxxl + space.xl} radius={radii.md} />
    </Screen>
  );
}
