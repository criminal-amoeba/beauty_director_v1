import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Checkbox, Text } from '@/components/ui';
import { LegalLinks } from '@/components/LegalLinks';
import { PURPOSES, REQUIRED_PURPOSES, type Purpose } from '@/features/onboarding/codes';
import { useTheme } from '@/theme/useTheme';
import { StepFooter, StepScroll, type StepProps } from './parts';

// One toggle per purpose, grouped Required / Optional so the page fits on a phone screen.
// Terms + Privacy and photo analysis are required to continue; training and marketing start off.
export function ConsentStep({ initial, onSubmit, saving, error }: StepProps<Record<Purpose, boolean>>) {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const [value, setValue] = useState(initial);
  const optional = PURPOSES.filter((p) => !REQUIRED_PURPOSES.includes(p));

  const group = (label: string, purposes: readonly Purpose[]) => (
    <View style={{ gap: space.sm }}>
      <Text variant="caption" color="textMuted">{label}</Text>
      <Card style={{ gap: 0, paddingVertical: space.xs }}>
        {purposes.map((p, i) => (
          <View key={p} style={{ paddingVertical: space.xs, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}>
            <Checkbox
              label={t(`onboarding.consent.${p}.title`)}
              checked={value[p]}
              onChange={(checked) => setValue({ ...value, [p]: checked })}
            />
            {/* Indent = checkbox box + gap, so the detail lines up with the label. */}
            <View style={{ paddingLeft: space.xl + space.md }}>
              {p === 'terms'
                ? <LegalLinks />
                : <Text variant="caption" color="textMuted">{t(`onboarding.consent.${p}.body`)}</Text>}
            </View>
          </View>
        ))}
      </Card>
    </View>
  );

  return (
    <>
      <StepScroll>
        {group(t('onboarding.consent.required'), REQUIRED_PURPOSES)}
        {group(t('onboarding.consent.optional'), optional)}
      </StepScroll>
      <StepFooter onPress={() => onSubmit(value)} disabled={!REQUIRED_PURPOSES.every((p) => value[p])} saving={saving} error={error} />
    </>
  );
}
