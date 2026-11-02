import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

type Props = { label: string; tone?: 'neutral' | 'primary' | 'am' | 'pm'; icon?: LucideIcon };

// Non-interactive status label (streak, "Due today", step counts).
export function Pill({ label, tone = 'neutral', icon: Icon }: Props) {
  const { colors, space, radii } = useTheme();
  const bg = { neutral: colors.surfaceMuted, primary: colors.primarySoft, am: colors.amSoft, pm: colors.pmSoft }[tone];
  const iconColor = { neutral: colors.textMuted, primary: colors.primary, am: colors.text, pm: colors.pm }[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: space.xs,
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
        borderRadius: radii.full,
        backgroundColor: bg,
      }}>
      {Icon && <Icon size={14} color={iconColor} />}
      <Text variant="caption">{label}</Text>
    </View>
  );
}
