import { View } from 'react-native';
import { CircleAlert, CloudOff, RefreshCw, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { Button } from './Button';
import { Text } from './Text';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  const { colors, space, radii } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg }}>
      <View
        style={{
          width: space.xxxl + space.lg,
          height: space.xxxl + space.lg,
          borderRadius: radii.full,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon size={28} color={colors.primary} />
      </View>
      <Text variant="h2" style={{ textAlign: 'center' }}>{title}</Text>
      {message && <Text color="textMuted" style={{ textAlign: 'center' }}>{message}</Text>}
      {action && (
        <View style={{ alignSelf: 'stretch', marginTop: space.sm }}>
          <Button title={action.label} onPress={action.onPress} variant="secondary" />
        </View>
      )}
    </View>
  );
}

type ErrorStateProps = {
  onRetry: () => void;
  offline?: boolean;
  title?: string;
  message?: string;
  retryLabel?: string;
  retrying?: boolean;
};

// Covers both the error and the offline/slow screen states.
export function ErrorState({
  onRetry,
  offline,
  title = offline ? "You're offline" : 'Something went wrong',
  message = offline ? "We'll pick up where you left off once you're back online." : "It's not you. Please try again in a moment.",
  retryLabel = 'Try again',
  retrying,
}: ErrorStateProps) {
  const { colors, space } = useTheme();
  const Icon = offline ? CloudOff : CircleAlert;
  return (
    <View style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.lg }}>
      <Icon size={32} color={colors.textMuted} />
      <Text variant="h2" style={{ textAlign: 'center' }}>{title}</Text>
      <Text color="textMuted" style={{ textAlign: 'center' }}>{message}</Text>
      <View style={{ alignSelf: 'stretch', marginTop: space.sm }}>
        <Button title={retryLabel} onPress={onRetry} variant="secondary" icon={RefreshCw} loading={retrying} />
      </View>
    </View>
  );
}
