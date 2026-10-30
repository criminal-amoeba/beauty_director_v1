import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

// size 'sm': smaller look for headers; hitSlop keeps the 44 pt touch target.
type Props = { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean; icon?: LucideIcon; size?: 'md' | 'sm' };

export function Chip({ label, selected = false, onPress, disabled, icon: Icon, size = 'md' }: Props) {
  const { colors, space, radii, layout } = useTheme();
  const sm = size === 'sm';
  const height = sm ? space.xxl : layout.minTouch;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: !!disabled }}
      hitSlop={{ top: (layout.minTouch - height) / 2, bottom: (layout.minTouch - height) / 2 }} // labels make it ≥ 44 wide
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        minHeight: height,
        paddingHorizontal: sm ? space.md : space.lg,
        borderRadius: radii.full,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.primary : colors.border,
        backgroundColor: selected ? colors.primarySoft : colors.surface,
        opacity: disabled ? 0.5 : 1,
      }}>
      {Icon && <Icon size={16} color={selected ? colors.primary : colors.textMuted} />}
      <Text variant={sm ? 'caption' : 'body'}>{label}</Text>
    </PressableScale>
  );
}
