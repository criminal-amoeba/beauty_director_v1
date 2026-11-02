import { KeyboardState } from 'react-native-reanimated';
import { isRealOpen } from '../keyboard-state';

// Only the enum is needed (jest hoists this mock); the real module needs the native worklets runtime.
jest.mock('react-native-reanimated', () => ({ KeyboardState: { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 } }));

describe('isRealOpen', () => {
  it('accepts OPEN right after a transition', () => {
    expect(isRealOpen(KeyboardState.OPEN, KeyboardState.OPENING)).toBe(true);
    expect(isRealOpen(KeyboardState.OPEN, KeyboardState.CLOSING)).toBe(true);
  });

  it('ignores a stale OPEN reported to a freshly mounted screen', () => {
    expect(isRealOpen(KeyboardState.OPEN, null)).toBe(false);
    expect(isRealOpen(KeyboardState.OPEN, KeyboardState.UNKNOWN)).toBe(false);
    expect(isRealOpen(KeyboardState.OPEN, KeyboardState.CLOSED)).toBe(false);
  });

  it('is false for any other state', () => {
    expect(isRealOpen(KeyboardState.CLOSED, KeyboardState.CLOSING)).toBe(false);
    expect(isRealOpen(KeyboardState.OPENING, KeyboardState.CLOSED)).toBe(false);
  });
});
