import { useEffect } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';

export const BURST_SIZE = 192;

// Static stand-in for the Lottie burst (Reduce Motion, web): a filled check shown briefly, then onDone.
export function CompletionCheck({ onDone }: { onDone: () => void }) {
  const { colors, radii } = useTheme();
  useEffect(() => {
    const id = setTimeout(onDone, 800);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <View style={{ width: BURST_SIZE, height: BURST_SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: BURST_SIZE / 2, height: BURST_SIZE / 2, borderRadius: radii.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={BURST_SIZE / 4} color={colors.onPrimary} strokeWidth={3} />
      </View>
    </View>
  );
}
