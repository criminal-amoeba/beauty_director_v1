import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CircleCheck, ListChecks, Moon, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, ChecklistItem, EmptyState, ErrorState, ProgressBar, Screen, Skeleton, Text } from '@/components/ui';
import { CompletionBurst } from '@/components/CompletionBurst';
import { isOneOf } from '@/features/onboarding/codes';
import { isOffline } from '@/features/routine/api';
import { buildCompletion } from '@/features/routine/completion';
import { routineDate } from '@/features/routine/dates';
import { useHome, useSubmitCompletion } from '@/features/routine/hooks';
import { PERIODS, type Period } from '@/features/routine/steps';
import { useNow } from '@/lib/use-now';
import { useTheme } from '@/theme/useTheme';

// One screen for both routines: /routine/am and /routine/pm.
export default function RoutineScreen() {
  const { period: param } = useLocalSearchParams<{ period: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
  const { data, error, isPending, refetch, isRefetching, userId } = useHome();
  const submit = useSubmitCompletion(userId);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [finished, setFinished] = useState<'saved' | 'queued' | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const now = useNow(60_000);
  const busy = useRef(false); // blocks a second tap before the button re-renders as loading
  const left = useRef(false);

  const goHome = useCallback(() => {
    if (left.current) return;
    left.current = true;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  const period: Period | null = isOneOf(PERIODS, param) ? param : null;
  if (!period) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState icon={ListChecks} title={t('routine.notFound')} action={{ label: t('common.backHome'), onPress: goHome }} />
      </Screen>
    );
  }

  if (isPending) return <RoutineSkeleton />;
  if (!data) {
    return (
      <Screen edges={['bottom']}>
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

  if (finished) {
    return (
      <Screen edges={['bottom']} scroll={false}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }} accessibilityLiveRegion="polite">
          <CompletionBurst period={period} onDone={goHome} />
          <Text variant="h1" style={{ textAlign: 'center' }}>{t('routine.complete')}</Text>
          {finished === 'queued' && <Text color="textMuted" style={{ textAlign: 'center' }}>{t('routine.savedOffline')}</Text>}
        </View>
      </Screen>
    );
  }

  const routine = data.routines[period];
  const total = routine.steps.length;
  const today = routineDate(now, data.tz);
  const done = data.completions.find((c) => c.period === period && c.local_date === today);

  const header = (
    <RoutineHeader period={period} subtitle={t('routine.steps', { count: total })} />
  );

  // While submitting, the cache already holds today's row: keep the checklist until the burst takes over.
  if (done && !submitting) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <EmptyState
          icon={CircleCheck}
          title={t('routine.doneTitle')}
          message={`${t(`routine.doneMessage.${period}`)}\n${t('routine.progress', { done: done.completed_step_ids.length, total })}`}
          action={{ label: t('common.backHome'), onPress: goHome }}
        />
      </Screen>
    );
  }

  if (total === 0) {
    return (
      <Screen edges={['bottom']}>
        {header}
        <EmptyState icon={ListChecks} title={t('routine.emptyTitle')} message={t('routine.emptyMessage')} />
      </Screen>
    );
  }

  const toggle = (id: string) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
    setSkipped((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const skip = (id: string) => setSkipped((prev) => new Set(prev).add(id));

  const finish = async () => {
    const row = buildCompletion({
      userId,
      routine: { id: routine.id, stepIds: routine.steps.map((s) => s.id) },
      period,
      ticked,
      skipped,
      now: Date.now(),
      tz: data.tz,
    });
    if (!row || busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const result = await submit.mutateAsync(row);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); // no engine on web/simulators
      setFinished(result);
    } catch {
      busy.current = false;
      setSubmitting(false);
      setSubmitError(true);
    }
  };

  const handled = routine.steps.filter((s) => ticked.has(s.id) || skipped.has(s.id)).length;

  return (
    <Screen edges={['bottom']}>
      {header}
      <ProgressBar value={handled / total} accessibilityLabel={t('routine.progress', { done: handled, total })} />
      {error && isOffline(error) && <Text variant="caption" color="textMuted">{t('home.offline')}</Text>}
      <View style={{ gap: space.sm }}>
        {routine.steps.map((s) => (
          <ChecklistItem
            key={s.id}
            title={s.name ?? t(`codes.stepType.${s.stepType}`)}
            subtitle={s.product ?? undefined}
            checked={ticked.has(s.id)}
            skipped={skipped.has(s.id)}
            onToggle={() => toggle(s.id)}
            onSkip={() => skip(s.id)}
            skipLabel={t('routine.skip')}
            skippedLabel={t('routine.skipped')}
          />
        ))}
      </View>
      {submitError && <Text color="danger" accessibilityLiveRegion="polite">{t('routine.submitError')}</Text>}
      <View style={{ gap: space.sm }}>
        <Button title={t('routine.finish')} onPress={finish} loading={submitting} disabled={ticked.size === 0} />
        {ticked.size === 0 && <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>{t('routine.finishHint')}</Text>}
      </View>
    </Screen>
  );
}

function RoutineHeader({ period, subtitle }: { period: Period; subtitle: string }) {
  const { t } = useTranslation();
  const { colors, space, radii, layout } = useTheme();
  const Icon = period === 'am' ? Sun : Moon;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View
        style={{
          width: layout.minTouch + space.xs,
          height: layout.minTouch + space.xs,
          borderRadius: radii.full,
          backgroundColor: period === 'am' ? colors.amSoft : colors.pmSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon size={24} color={period === 'am' ? colors.text : colors.pm} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="h1">{t(`routine.title.${period}`)}</Text>
        <Text variant="caption" color="textMuted">{subtitle}</Text>
      </View>
    </View>
  );
}

function RoutineSkeleton() {
  const { space, layout, radii } = useTheme();
  return (
    <Screen edges={['bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Skeleton width={layout.minTouch + space.xs} height={layout.minTouch + space.xs} radius={radii.full} />
        <View style={{ flex: 1, gap: space.xs }}>
          <Skeleton width="60%" height={space.xxl} />
          <Skeleton width="30%" />
        </View>
      </View>
      <Skeleton height={space.sm} radius={radii.full} />
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={layout.minTouch + space.xl} />)}
    </Screen>
  );
}
