import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/useTheme';

const DOT = 6;
const STEP = 150; // stagger between dots

function Dot({ index, reduceMotion }: { index: number; reduceMotion: boolean }) {
  const { colors, space } = useTheme();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    y.set(withDelay(index * STEP, withRepeat(withSequence(withTiming(-space.xs, { duration: 300 }), withTiming(0, { duration: 300 }), withTiming(0, { duration: 300 })), -1)));
    return () => y.set(0);
  }, [index, reduceMotion, space.xs, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.textMuted }, style]} />;
}

// Three bouncing dots in an assistant-style bubble; static under Reduce Motion. Screen readers hear the label.
export function TypingIndicator() {
  const { t } = useTranslation();
  const { colors, space, radii, shadow } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <View style={{ alignItems: 'flex-start', paddingLeft: 32 + space.sm }} accessibilityLabel={t('chat.typing')} accessibilityLiveRegion="polite" accessible>
      <View style={[{ flexDirection: 'row', gap: space.xs, backgroundColor: colors.surface, borderRadius: radii.md, borderBottomLeftRadius: radii.sm, paddingHorizontal: space.lg, paddingVertical: space.md + space.xs }, shadow.sm]}>
        {[0, 1, 2].map((i) => <Dot key={i} index={i} reduceMotion={reduceMotion} />)}
      </View>
    </View>
  );
}
