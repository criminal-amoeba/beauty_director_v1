import { View } from 'react-native';
import { ScanFace } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Text } from '@/components/ui';
import { countdownParts, scanDue } from '@/features/scan/due';
import { useNow } from '@/lib/use-now';
import { useTheme } from '@/theme/useTheme';

type Props = { lastScanAt: string | null; tz: string; onStart: () => void };

// Seven pips = the seven days between scans, filled as they pass; the countdown is calm (no seconds).
// Own component so the 1 s clock re-renders only this card.
export function ScanCard({ lastScanAt, tz, onStart }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, space, radii } = useTheme();
  const now = useNow();
  const { due, msLeft, daysSince } = scanDue(lastScanAt, now);
  const filled = due ? 7 : (daysSince ?? 0);
  const parts = countdownParts(msLeft);
  const lastDate = lastScanAt
    ? new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', timeZone: tz }).format(new Date(lastScanAt))
    : null;

  return (
    <Card tone="primary" style={{ gap: space.md, padding: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <ScanFace size={20} color={colors.primary} />
        <Text variant="label" style={{ flex: 1 }}>{t('home.scan.title')}</Text>
      </View>

      {due ? (
        <View style={{ gap: space.xs }}>
          <Text variant="h1">{lastScanAt ? t('home.scan.arrived') : t('home.scan.title')}</Text>
          <Text color="textMuted">{lastScanAt ? t('home.scan.arrivedBody') : t('home.scan.first')}</Text>
        </View>
      ) : (
        <View>
          <Text variant="caption" color="textMuted">{t('home.scan.nextIn')}</Text>
          <Text variant="display">{'days' in parts ? t('home.scan.days', parts) : t('home.scan.hours', parts)}</Text>
        </View>
      )}

      <View
        accessible
        accessibilityLabel={t('home.scan.daysSince', { count: filled })}
        style={{ flexDirection: 'row', gap: space.sm }}>
        {Array.from({ length: 7 }, (_, i) => (
          <View
            key={i}
            style={{
              width: space.md,
              height: space.md,
              borderRadius: radii.full,
              borderWidth: 2,
              borderColor: colors.primary,
              backgroundColor: i < filled ? colors.primary : 'transparent',
            }}
          />
        ))}
      </View>

      {lastDate && <Text variant="caption" color="textMuted">{t('home.scan.lastScan', { date: lastDate })}</Text>}
      {due && <Button title={t('home.scan.start')} icon={ScanFace} onPress={onStart} />}
    </Card>
  );
}
