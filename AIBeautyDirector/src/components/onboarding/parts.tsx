import { useState, type ReactNode } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Text } from '@/components/ui';
import { FormBanner } from '@/components/AuthFields';
import type { SaveError } from '@/features/onboarding/api';
import { useTheme } from '@/theme/useTheme';

// Every step starts from the saved answer and hands its new value to the wizard, which saves it.
export type StepProps<T> = { initial: T; onSubmit: (value: T) => void; saving: boolean; error: SaveError | null };

export const toggle = <C,>(list: readonly C[], c: C) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]);

type ChipGroupProps<C extends string> = {
  label?: string;
  codes: readonly C[];
  selected: readonly C[];
  labelOf: (c: C) => string;
  onPress: (c: C) => void;
  selectedIcon?: LucideIcon;
};

export function ChipGroup<C extends string>({ label, codes, selected, labelOf, onPress, selectedIcon }: ChipGroupProps<C>) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space.sm }}>
      {label && <Text variant="label">{label}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {codes.map((c) => {
          const on = selected.includes(c);
          return <Chip key={c} label={labelOf(c)} selected={on} icon={on ? selectedIcon : undefined} onPress={() => onPress(c)} />;
        })}
      </View>
    </View>
  );
}

// A step's content. Fills the space between the fixed title and the pinned footer and scrolls only when it must;
// then a hairline above the footer shows there is more. Bleeds into the screen padding so card shadows aren't clipped.
export function StepScroll({ children }: { children: ReactNode }) {
  const { colors, space, layout } = useTheme();
  const { width } = useWindowDimensions();
  const pad = width < layout.compactWidth ? layout.screenPaddingCompact : layout.screenPadding;
  const [boxHeight, setBoxHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const overflow = contentHeight > boxHeight + 1;
  return (
    <ScrollView
      style={{ flex: 1, marginHorizontal: -pad, borderBottomWidth: overflow ? 1 : 0, borderColor: colors.border }}
      contentContainerStyle={{ gap: space.lg, paddingHorizontal: pad, paddingVertical: space.xs }}
      keyboardShouldPersistTaps="handled"
      onLayout={(e) => setBoxHeight(e.nativeEvent.layout.height)}
      onContentSizeChange={(_, h) => setContentHeight(h)}>
      {children}
    </ScrollView>
  );
}

// Save error + the step's one primary action, pinned below the content.
export function StepFooter({ title, onPress, disabled, saving, error }: {
  title?: string; onPress: () => void; disabled?: boolean; saving: boolean; error: SaveError | null;
}) {
  const { t } = useTranslation();
  const { space } = useTheme();
  const banner = error === 'onboarding.errors.under18' ? null : error; // under18 is shown on the date field
  return (
    <View style={{ gap: space.md }}>
      <FormBanner error={banner} />
      <Button title={title ?? t('onboarding.continue')} onPress={onPress} disabled={disabled} loading={saving} />
    </View>
  );
}
