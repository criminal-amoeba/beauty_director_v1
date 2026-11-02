import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Steps, Text } from '@/components/ui';
import { useNow } from '@/lib/use-now';
import { useTheme } from '@/theme/useTheme';

export type ScanStage = 'uploading' | 'analyzing' | 'reviewing';
const STAGES: ScanStage[] = ['uploading', 'analyzing', 'reviewing'];
const SLOW_AFTER_MS = 15_000;

// Real stages (upload → the scans row says pending → processing); never a frozen screen (plan §5).
export function ScanProgress({ stage, startedAt }: { stage: ScanStage; startedAt: number }) {
  const { t } = useTranslation();
  const { space } = useTheme();
  const now = useNow();
  const current = STAGES.indexOf(stage) + 1;
  return (
    <Screen edges={['bottom']} scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        <Text variant="h1">{t(`scan.progress.${stage}`)}</Text>
        <Steps current={current} total={STAGES.length} label={t('scan.progress.step', { current, total: STAGES.length })} />
        <Text color="textMuted">{now - startedAt > SLOW_AFTER_MS ? t('scan.progress.slow') : t('scan.progress.hint')}</Text>
      </View>
    </Screen>
  );
}
