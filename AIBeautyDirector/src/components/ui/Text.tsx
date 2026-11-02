import { Text as RNText, type TextProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { cjkWeight, type Colors, fonts, type TextVariant } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';

type Props = TextProps & { variant?: TextVariant; color?: keyof Colors; bold?: boolean; italic?: boolean };

// bold: the bold face in Latin, weight 700 in the CJK system font. italic: fontStyle only (shortcut: the Plus
// Jakarta italic faces are not bundled, so iOS may render Latin italics upright; bundle them if italics matter).
export function Text({ variant = 'body', color = 'text', bold, italic, style, ...rest }: Props) {
  const { type, colors } = useTheme();
  const { i18n } = useTranslation();
  const role = variant === 'display' || variant === 'h1' || variant === 'h2' ? 'header' : undefined;
  const { fontFamily, ...metrics } = type[variant];
  const font = i18n.language === 'zh-TW'
    ? { ...metrics, fontWeight: bold ? '700' as const : cjkWeight[variant] }
    : { ...metrics, fontFamily: bold ? fonts.bold : fontFamily };
  return (
    <RNText accessibilityRole={role} {...rest} style={[font, italic ? { fontStyle: 'italic' } : null, { color: colors[color] }, style]} />
  );
}
