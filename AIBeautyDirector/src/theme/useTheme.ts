import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { type ColorScheme, layout, motion, palette, radii, shadow, space, type } from './tokens';

// Forces a scheme for a subtree (used by the dev gallery); null = follow the system.
export const ThemeOverride = createContext<ColorScheme | null>(null);

export function useTheme() {
  const system = useColorScheme();
  const scheme: ColorScheme = useContext(ThemeOverride) ?? (system === 'dark' ? 'dark' : 'light');
  const colors = palette[scheme];
  return { scheme, colors, type, space, radii, layout, motion, shadow: shadow(colors) };
}

export type Theme = ReturnType<typeof useTheme>;
