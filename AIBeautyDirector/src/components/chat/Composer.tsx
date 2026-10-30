import { View } from 'react-native';
import { Send } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Input, Text } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

export const MAX_MESSAGE_CHARS = 1000;

type Props = { value: string; onChange: (v: string) => void; onSend: () => void; sending: boolean; disabled?: boolean };

// Multiline input + counter + send. Send is off while empty, over the limit or a request is in flight.
export function Composer({ value, onChange, onSend, sending, disabled }: Props) {
  const { t } = useTranslation();
  const { space } = useTheme();
  const length = value.trim().length;
  const over = length > MAX_MESSAGE_CHARS;
  return (
    <View style={{ gap: space.sm }}>
      <Input
        label={t('chat.composer.label')}
        placeholder={t('chat.composer.placeholder')}
        value={value}
        onChangeText={onChange}
        multiline
        numberOfLines={3}
        maxLength={MAX_MESSAGE_CHARS + 50}
        textAlignVertical="top"
        editable={!disabled}
        error={over ? t('chat.errors.message_too_long') : undefined}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Text variant="caption" color={over ? 'danger' : 'textMuted'} style={{ flex: 1 }}>
          {t('chat.composer.counter', { count: length, max: MAX_MESSAGE_CHARS })}
        </Text>
        <Button title={t('chat.composer.send')} icon={Send} onPress={onSend} loading={sending} disabled={disabled || length === 0 || over} />
      </View>
    </View>
  );
}
