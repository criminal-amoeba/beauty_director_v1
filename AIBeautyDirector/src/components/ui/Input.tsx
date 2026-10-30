import { useState, type ReactNode } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { Text } from './Text';

// leading: a control shown left of the field in the same row (e.g. a country code picker).
type Props = TextInputProps & { label: string; error?: string; helper?: string; leading?: ReactNode };

export function Input({ label, error, helper, leading, editable = true, onFocus, onBlur, style, ...rest }: Props) {
  const { colors, type, space, radii, layout } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: space.xs, opacity: editable ? 1 : 0.5 }}>
      <Text variant="caption">{label}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        {leading}
        <TextInput
          {...rest}
          editable={editable}
          accessibilityLabel={label}
          accessibilityHint={error ?? helper}
          placeholderTextColor={colors.textMuted}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          style={[
            type.body,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              minHeight: layout.minTouch + space.xs,
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              borderRadius: radii.sm,
              borderWidth: focused || error ? 2 : 1,
              borderColor,
            },
            { flex: 1, minWidth: 0 }, // minWidth: lets it shrink beside `leading` on web
            style,
          ]}
        />
      </View>
      {error ? (
        <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }} accessibilityLiveRegion="polite">
          <CircleAlert size={14} color={colors.danger} />
          <Text variant="caption" color="danger" style={{ flexShrink: 1 }}>{error}</Text>
        </View>
      ) : helper ? (
        <Text variant="caption" color="textMuted">{helper}</Text>
      ) : null}
    </View>
  );
}
