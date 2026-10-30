import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/theme/useTheme';
import { PressableScale } from './PressableScale';
import { Text } from './Text';

function Box({ checked, muted }: { checked: boolean; muted?: boolean }) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        width: space.xl,
        height: space.xl,
        borderRadius: space.sm,
        borderWidth: 2,
        borderColor: checked ? colors.primary : colors.textMuted,
        backgroundColor: checked ? colors.primary : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: muted ? 0.5 : 1,
      }}>
      {checked && <Check size={16} color={colors.onPrimary} strokeWidth={3} />}
    </View>
  );
}

const tick = () => Haptics.selectionAsync().catch(() => {}); // no haptics engine on web/simulators

type CheckboxProps = { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean };

export function Checkbox({ label, checked, onChange, disabled }: CheckboxProps) {
  const { space, layout } = useTheme();
  return (
    <PressableScale
      disabled={disabled}
      onPress={() => { tick(); onChange(!checked); }}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled: !!disabled }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: layout.minTouch, opacity: disabled ? 0.5 : 1 }}>
      <Box checked={checked} />
      <Text style={{ flex: 1 }}>{label}</Text>
    </PressableScale>
  );
}

type ChecklistItemProps = {
  title: string;
  subtitle?: string;
  checked: boolean;
  onToggle: () => void;
  skipped?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
  skippedLabel?: string;
};

export function ChecklistItem({
  title, subtitle, checked, onToggle, skipped, onSkip, skipLabel = 'Skip', skippedLabel = 'Skipped',
}: ChecklistItemProps) {
  const { colors, space, radii, layout } = useTheme();
  const done = checked || skipped;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: radii.sm,
        borderWidth: 1,
        borderColor: checked ? colors.primary : colors.border,
        paddingLeft: space.lg,
        paddingRight: space.sm,
        minHeight: layout.minTouch + space.lg,
      }}>
      <PressableScale
        onPress={() => { tick(); onToggle(); }}
        accessibilityRole="checkbox"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ checked }}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md }}>
        <Box checked={checked} muted={skipped} />
        <View style={{ flex: 1 }}>
          <Text
            variant="label"
            color={done ? 'textMuted' : 'text'}
            style={{ textDecorationLine: checked ? 'line-through' : 'none' }}>
            {title}
          </Text>
          {(subtitle || skipped) && (
            <Text variant="caption" color="textMuted">{skipped ? skippedLabel : subtitle}</Text>
          )}
        </View>
      </PressableScale>
      {onSkip && !done && (
        <PressableScale
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel={`${skipLabel}: ${title}`}
          style={{ minHeight: layout.minTouch, minWidth: layout.minTouch, paddingHorizontal: space.md, justifyContent: 'center' }}>
          <Text variant="caption" color="textMuted">{skipLabel}</Text>
        </PressableScale>
      )}
    </View>
  );
}
