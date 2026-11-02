import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, Chip, Text } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

type Props = { onAsk: (text: string) => void };

// Empty thread: the Director introduces herself and offers three questions to tap.
export function Welcome({ onAsk }: Props) {
  const { t } = useTranslation();
  const { space, layout } = useTheme();
  const questions = [t('chat.welcome.q1'), t('chat.welcome.q2'), t('chat.welcome.q3')];
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' }}>
      <Avatar name={t('chat.title')} size="lg" />
      <Text variant="h2" style={{ textAlign: 'center' }}>{t('chat.welcome.title')}</Text>
      <Text color="textMuted" style={{ textAlign: 'center' }}>{t('chat.welcome.message')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, paddingTop: space.sm }}>
        {questions.map((q) => <Chip key={q} label={q} onPress={() => onAsk(q)} />)}
      </View>
    </View>
  );
}
