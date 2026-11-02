import { useEffect } from 'react';
import LottieView from 'lottie-react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { Period } from '@/features/routine/steps';
import { useTheme } from '@/theme/useTheme';
import { BURST_SIZE, CompletionCheck } from './CompletionCheck';

type Props = { period: Period; onDone: () => void };

// Routine-complete moment (~1.2 s). Layers are recolored from the theme, so the asset holds no palette.
// Web uses CompletionBurst.web.tsx (no Lottie in the web bundle).
export function CompletionBurst({ period, onDone }: Props) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  // Backstop in case the animation never reports finishing; onDone must be safe to call twice.
  useEffect(() => {
    if (reduceMotion) return;
    const id = setTimeout(onDone, 2000);
    return () => clearTimeout(id);
  }, [onDone, reduceMotion]);

  if (reduceMotion) return <CompletionCheck onDone={onDone} />;
  return (
    <LottieView
      source={require('@/assets/lottie/routine-complete.json')}
      autoPlay
      loop={false}
      onAnimationFinish={onDone}
      colorFilters={[
        { keypath: 'Circle', color: colors.primary },
        { keypath: 'Check', color: colors.onPrimary },
        { keypath: 'Sparkles', color: period === 'am' ? colors.am : colors.pm },
      ]}
      style={{ width: BURST_SIZE, height: BURST_SIZE }}
    />
  );
}
