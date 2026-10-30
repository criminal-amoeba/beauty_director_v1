import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/useTheme';
import { PressableScale } from './PressableScale';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  tone?: 'default' | 'primary' | 'am' | 'pm';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, onPress, tone = 'default', accessibilityLabel, style }: Props) {
  const { colors, space, radii, shadow } = useTheme();
  const bg = { default: colors.surface, primary: colors.primarySoft, am: colors.amSoft, pm: colors.pmSoft }[tone];
  const cardStyle = [
    { backgroundColor: bg, borderRadius: radii.md, padding: space.lg, gap: space.sm },
    onPress ? shadow.md : shadow.sm,
    style,
  ];

  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={cardStyle}>
      {children}
    </PressableScale>
  );
}
