import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

type ProgressBarProps = { value: number; accessibilityLabel?: string };

export function ProgressBar({ value, accessibilityLabel }: ProgressBarProps) {
  const { colors, space, radii, motion } = useTheme();
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, value));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.set(reduceMotion ? clamped : withTiming(clamped, { duration: motion.normal }));
  }, [clamped, reduceMotion, motion.normal, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height: space.sm, borderRadius: radii.full, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: radii.full, backgroundColor: colors.primary }, fillStyle]} />
    </View>
  );
}

type StepsProps = { current: number; total: number; label?: string };

// current is 1-based. label e.g. "Step 2 of 7" (caller passes the localized string).
export function Steps({ current, total, label }: StepsProps) {
  const { colors, space, radii } = useTheme();
  return (
    <View
      style={{ gap: space.sm }}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: current }}>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              flex: i + 1 === current ? 2 : 1,
              height: space.xs,
              borderRadius: radii.full,
              backgroundColor: i < current ? colors.primary : colors.border,
            }}
          />
        ))}
      </View>
      {label && <Text variant="caption" color="textMuted">{label}</Text>}
    </View>
  );
}
