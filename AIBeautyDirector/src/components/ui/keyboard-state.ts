import { KeyboardState } from 'react-native-reanimated';

// Reanimated (Android) changes its keyboard state only during a keyboard animation, so a keyboard that disappears
// without one (app sent to the background for the LINE browser, screens swapped) stays OPEN at its old height, and
// every Screen mounted later is told "open". A real open always reports OPENING first (CLOSING when that stale
// height is left over), so OPEN counts only right after a transition this screen saw.
export function isRealOpen(state: KeyboardState, previous: KeyboardState | null) {
  'worklet';
  return state === KeyboardState.OPEN && (previous === KeyboardState.OPENING || previous === KeyboardState.CLOSING);
}
