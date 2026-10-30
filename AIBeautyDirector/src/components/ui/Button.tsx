import { ActivityIndicator, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', icon: Icon, loading, disabled }: Props) {
  const { colors, space, radii, layout } = useTheme();
  const inactive = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger';
  const fg = filled ? colors.onPrimary : colors.text;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={{ opacity: disabled ? 0.5 : 1 }}>
      {({ pressed }) => (
        <View
          style={{
            minHeight: layout.minTouch + space.sm,
            paddingHorizontal: space.xl,
            paddingVertical: space.md,
            borderRadius: radii.sm,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: space.sm,
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: colors.border,
            opacity: variant === 'danger' && pressed ? 0.85 : 1,
            backgroundColor:
              variant === 'danger'
                ? colors.danger
                : variant === 'primary'
                ? pressed ? colors.primaryPressed : colors.primary
                : variant === 'secondary'
                  ? pressed ? colors.surfaceMuted : colors.surface
                  : pressed ? colors.surfaceMuted : 'transparent',
          }}>
          {loading ? (
            <ActivityIndicator color={fg} />
          ) : (
            Icon && <Icon size={20} color={fg} strokeWidth={2} />
          )}
          <Text variant="label" style={{ color: fg, textAlign: 'center', flexShrink: 1 }}>
            {title}
          </Text>
        </View>
      )}
    </PressableScale>
  );
}
