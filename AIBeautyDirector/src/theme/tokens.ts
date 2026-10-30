// Single source of design values ("Porcelain & Rose Clay").
// Contrast rules enforced by __tests__/contrast.test.ts:
// - primary is a fill/border/icon colour, never body text in light mode (4.39:1).
// - success/warning are icon/fill colours; labels beside them use `text`.
// - danger text only on background/surface.

export const palette = {
  light: {
    background: '#FBF7F4',
    surface: '#FFFFFF',
    surfaceMuted: '#F3EBE5',
    border: '#E8DDD5',
    text: '#2B2420',
    textMuted: '#75675F',
    primary: '#B35A50',
    primaryPressed: '#9A4A41',
    primarySoft: '#F6E3DF',
    onPrimary: '#FFFFFF',
    am: '#F0B27A',
    amSoft: '#FCEBD9',
    pm: '#4A4468',
    pmSoft: '#E6E3F0',
    success: '#5E8B6E',
    warning: '#D9A441',
    danger: '#BF4040',
    shadow: '#5A3A2E',
    scrim: 'rgba(43, 36, 32, 0.4)',
  },
  dark: {
    background: '#181311',
    surface: '#241D1A',
    surfaceMuted: '#2E2521',
    border: '#3A2F2A',
    text: '#F5EDE8',
    textMuted: '#B5A59C',
    primary: '#D9867B',
    primaryPressed: '#C4736A',
    primarySoft: '#3A2420',
    onPrimary: '#181311',
    am: '#F0B27A',
    amSoft: '#3A2C1E',
    pm: '#A9A0D6',
    pmSoft: '#2A2740',
    // light values +12% HSL lightness
    success: '#7EA88D',
    warning: '#E3BC74',
    danger: '#CE6E6E',
    shadow: '#000000',
    scrim: 'rgba(0, 0, 0, 0.55)',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof (typeof palette)['light']]: string };

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 32, lineHeight: 38 },
  h1: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32 },
  h2: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
} as const;

export type TextVariant = keyof typeof type;

// zh-TW uses the system font (PingFang TC / Noto Sans CJK); Plus Jakarta has no CJK glyphs.
// Weight is only set there: on Android a fontWeight on a single-weight custom family can swap the font.
export const cjkWeight: Record<TextVariant, '400' | '500' | '600' | '700'> = {
  display: '700',
  h1: '700',
  h2: '600',
  body: '400',
  label: '600',
  caption: '500',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radii = { sm: 12, md: 20, lg: 28, full: 999 } as const;

export const layout = {
  screenPadding: 20,
  screenPaddingCompact: 16,
  compactWidth: 360,
  maxContentWidth: 640,
  minTouch: 44,
} as const;

export const motion = {
  fast: 150,
  normal: 250,
  pressScale: 0.97,
  spring: { damping: 18, stiffness: 300 },
} as const;

export const shadow = (colors: Colors) => ({
  sm: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  md: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
});
