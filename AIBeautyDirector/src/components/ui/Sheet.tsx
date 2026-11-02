import type { ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  closeLabel?: string;
  children: ReactNode;
};

// Bottom sheet on RN Modal: tap the scrim, the X, or Android back to close.
// No Reanimated slide-in: a UI-thread transform left Android's stale view position in place, so presses inside
// were cancelled by the slightest finger movement (2026-10-30). The Modal's own fade animates the window instead.
export function Sheet({ visible, onClose, title, closeLabel = 'Close', children }: Props) {
  const { colors, space, radii, layout } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        />
        <View
          accessibilityViewIsModal
          style={{
            width: '100%',
            maxWidth: layout.maxContentWidth,
            alignSelf: 'center',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radii.lg,
            borderTopRightRadius: radii.lg,
            paddingHorizontal: layout.screenPadding,
            paddingTop: space.sm,
            paddingBottom: Math.max(insets.bottom, space.xl),
            gap: space.lg,
          }}>
          <View style={{ alignSelf: 'center', width: space.xxl + space.sm, height: space.xs, borderRadius: radii.full, backgroundColor: colors.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md }}>
            <Text variant="h2" style={{ flex: 1 }}>{title}</Text>
            <PressableScale
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              style={{ width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' }}>
              <X size={22} color={colors.textMuted} />
            </PressableScale>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
