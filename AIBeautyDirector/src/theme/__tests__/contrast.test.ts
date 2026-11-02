import { palette, type ColorScheme } from '../tokens';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

type Key = keyof (typeof palette)['light'];
const surfaces: Key[] = ['background', 'surface', 'surfaceMuted'];

// Text pairs the primitives actually render (WCAG AA body text, 4.5:1).
const textPairs: [Key, Key][] = [
  ...(['text', 'textMuted'] as Key[]).flatMap((fg) => surfaces.map((bg): [Key, Key] => [fg, bg])),
  ['text', 'primarySoft'],
  ['text', 'amSoft'],
  ['text', 'pmSoft'],
  ['onPrimary', 'primary'],
  ['danger', 'background'],
  ['danger', 'surface'],
];

// Non-text UI parts (WCAG 1.4.11, 3:1): filled buttons, checkbox outlines, focus rings, icons.
const uiPairs: [Key, Key][] = [
  ['primary', 'background'],
  ['primary', 'surface'],
  ['textMuted', 'surface'],
  ['pm', 'surface'],
  ['success', 'surface'],
  ['danger', 'surface'],
];

describe.each(Object.keys(palette) as ColorScheme[])('%s palette', (scheme) => {
  const c = palette[scheme];

  it('keeps the self-check honest', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it.each(textPairs)('%s on %s ≥ 4.5', (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiPairs)('%s on %s ≥ 3', (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(3);
  });
});
