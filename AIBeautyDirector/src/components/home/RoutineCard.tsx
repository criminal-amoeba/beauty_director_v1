import { View } from 'react-native';
import { CircleCheck, Moon, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Card, Pill, ProgressBar, Text } from '@/components/ui';
import type { Completion, Routine } from '@/features/routine/api';
import type { Period } from '@/features/routine/steps';
import { useTheme } from '@/theme/useTheme';

type Props = { period: Period; routine: Routine; completion?: Completion; highlighted: boolean; onPress: () => void };

// Half-width card; the one matching the time of day takes its period tone. Wraps to full width when narrow.
export function RoutineCard({ period, routine, completion, highlighted, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, scheme, space, radii, layout } = useTheme();
  const Icon = period === 'am' ? Sun : Moon;
  const total = routine.steps.length;
  const done = completion?.completed_step_ids.length ?? 0;
  const title = t(`home.${period}.title`);
  const status = completion ? t('home.routine.done') : t('home.routine.steps', { count: total });
  // Icon on the solid period colour: dark ink on apricot, onPrimary on plum (both pass in light and dark).
  const iconColor = period === 'am' && scheme === 'light' ? colors.text : colors.onPrimary;

  return (
    <Card
      tone={highlighted ? period : 'default'}
      onPress={onPress}
      accessibilityLabel={`${title}, ${status}`}
      style={{ flexGrow: 1, flexBasis: space.xxxl * 3, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
        <View
          style={{
            width: layout.minTouch,
            height: layout.minTouch,
            borderRadius: radii.full,
            backgroundColor: period === 'am' ? colors.am : colors.pm,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon size={22} color={iconColor} />
        </View>
        {completion ? (
          <CircleCheck size={22} color={colors.success} />
        ) : (
          highlighted && <Pill label={t('home.routine.now')} tone="neutral" />
        )}
      </View>
      <View>
        <Text variant="h2">{title}</Text>
        <Text variant="caption" color="textMuted">{status}</Text>
      </View>
      {completion && total > 0 && (
        <View style={{ gap: space.xs }}>
          <ProgressBar value={done / total} />
          <Text variant="caption" color="textMuted">{t('home.routine.progress', { done, total })}</Text>
        </View>
      )}
    </Card>
  );
}
