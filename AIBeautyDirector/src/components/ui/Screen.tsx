import { useEffect, type ReactNode } from 'react';
import { Keyboard, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, KeyboardState, makeMutable, runOnJS, useAnimatedKeyboard, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { readJson, writeJson } from '@/lib/storage';
import { useTheme } from '@/theme/useTheme';
import { isRealOpen } from './keyboard-state';

// The keyboard height is remembered app-wide and on the device, so the slide can start with the keyboard on
// every screen and every launch; only the first keyboard of a fresh install waits for the measured height.
// shortcut: stored in the (secure) device store because it is the only key-value store the app has.
const KEYBOARD_HEIGHT_KEY = 'keyboard_height';
const lastKeyboardHeight = makeMutable(0);
let restoring: Promise<void> | null = null;
const restoreKeyboardHeight = () =>
  (restoring ??= readJson<number>(KEYBOARD_HEIGHT_KEY)
    .then((v) => { if (typeof v === 'number' && v > 0 && lastKeyboardHeight.value === 0) lastKeyboardHeight.value = v; })
    .catch(() => {}));
const persistKeyboardHeight = (h: number) => { writeJson(KEYBOARD_HEIGHT_KEY, h).catch(() => {}); };

type Props = {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  // How the content makes room for the keyboard. 'pad' shrinks the content (forms: everything stays reachable by
  // scrolling). 'shift' slides the whole content up and clips the top (chat: a transform, so the list is never
  // re-laid out while the keyboard moves).
  keyboard?: 'pad' | 'shift';
};

// Safe area + keyboard avoidance + responsive padding + capped content width.
export function Screen({ children, scroll = true, edges = ['top', 'bottom'], keyboard: mode = 'pad' }: Props) {
  const { colors, scheme, space, layout, motion } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Edge-to-edge Android (SDK 54+) no longer resizes the window for the keyboard and KeyboardAvoidingView
  // misjudges the gap, so the keyboard height comes from Reanimated (measured from the screen edge; the
  // safe-area bottom is already padded by SafeAreaView).
  const keyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true });
  // Android reports irregular heights while the keyboard animates, so the content never tracks them. One timed
  // slide per state change: as soon as the keyboard starts opening when its height is known from a previous
  // open, otherwise when it reports open; back to 0 as soon as it starts closing.
  useEffect(() => { restoreKeyboardHeight(); }, []);
  const offset = useSharedValue(0);
  const slide = { duration: motion.normal, easing: Easing.out(Easing.cubic) };
  useAnimatedReaction(
    () => keyboard.state.value,
    (state, previous) => {
      if (state === previous) return;
      if (state === KeyboardState.OPEN) {
        if (!isRealOpen(state, previous)) return;
        const h = keyboard.height.value;
        if (h !== lastKeyboardHeight.value) {
          lastKeyboardHeight.value = h;
          runOnJS(persistKeyboardHeight)(h);
        }
        offset.value = withTiming(Math.max(0, h - insets.bottom), slide);
      } else if (state === KeyboardState.OPENING) {
        if (lastKeyboardHeight.value > 0) offset.value = withTiming(Math.max(0, lastKeyboardHeight.value - insets.bottom), slide);
      } else {
        offset.value = withTiming(0, slide);
      }
    },
  );
  // A screen can mount while the previous screen's keyboard is still up (Verify → Onboarding): Reanimated then
  // reports it open, and the close that follows the input's unmount may never reach this screen, leaving the
  // content padded by a keyboard that is gone. React Native's own keyboard events are the source of truth here.
  useEffect(() => {
    if (!Keyboard.isVisible()) offset.set(0);
    const sub = Keyboard.addListener('keyboardDidHide', () => offset.set(withTiming(0, { duration: motion.normal, easing: Easing.out(Easing.cubic) })));
    return () => sub.remove();
  }, [offset, motion.normal]);
  const avoid = useAnimatedStyle(() => (mode === 'shift' ? { transform: [{ translateY: -offset.value }] } : { paddingBottom: offset.value }));
  const content = {
    flexGrow: 1,
    width: '100%' as const,
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center' as const,
    padding: width < layout.compactWidth ? layout.screenPaddingCompact : layout.screenPadding,
    gap: space.lg,
  };

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background, overflow: mode === 'shift' ? 'hidden' : 'visible' }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Animated.View style={[{ flex: 1 }, avoid]}>
        {scroll ? (
          <ScrollView contentContainerStyle={content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={content}>{children}</View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}
