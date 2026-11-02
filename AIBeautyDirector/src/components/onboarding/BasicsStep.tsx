import { View } from 'react-native';
import { Controller, useForm, useFormState } from 'react-hook-form';
import { CircleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Input, Text } from '@/components/ui';
import { useFieldError } from '@/components/AuthFields';
import { GENDERS } from '@/features/onboarding/codes';
import { basicsSchema, type Basics } from '@/features/onboarding/schemas';
import { zodResolver } from '@/lib/zod-resolver';
import { useTheme } from '@/theme/useTheme';
import { ChipGroup, StepFooter, StepScroll, type StepProps } from './parts';

export function BasicsStep({ initial, onSubmit, saving, error }: StepProps<Basics>) {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const fieldError = useFieldError();
  const { control, handleSubmit } = useForm({ resolver: zodResolver(basicsSchema), defaultValues: initial });
  const { errors } = useFormState({ control });
  const submit = handleSubmit((v) => onSubmit(v));
  // The DB trigger is the 18+ check; its rejection shows here like a field error.
  const dateError = fieldError(errors.year?.message) ?? (error === 'onboarding.errors.under18' ? t(error) : undefined);

  const datePart = (name: 'year' | 'month' | 'day', flex: number, maxLength: number) => (
    <View style={{ flex }}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            label={t(`onboarding.basics.${name}`)}
            placeholder={t(`onboarding.basics.${name}Placeholder`)}
            value={field.value}
            onChangeText={(v) => field.onChange(v.replace(/\D/g, ''))}
            onBlur={field.onBlur}
            keyboardType="number-pad"
            maxLength={maxLength}
          />
        )}
      />
    </View>
  );

  return (
    <>
      <StepScroll>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input
              label={t('onboarding.basics.name')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              maxLength={50}
              autoComplete="name"
              textContentType="name"
              error={fieldError(errors.name?.message)}
            />
          )}
        />
        <View style={{ gap: space.xs }}>
          <Text variant="label">{t('onboarding.basics.birthDate')}</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {datePart('year', 2, 4)}
            {datePart('month', 1, 2)}
            {datePart('day', 1, 2)}
          </View>
          {dateError ? (
            <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }} accessibilityLiveRegion="polite">
              <CircleAlert size={14} color={colors.danger} />
              <Text variant="caption" color="danger" style={{ flexShrink: 1 }}>{dateError}</Text>
            </View>
          ) : (
            <Text variant="caption" color="textMuted">{t('onboarding.basics.birthDateHelper')}</Text>
          )}
        </View>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <View style={{ gap: space.xs }}>
              <ChipGroup
                label={t('onboarding.basics.gender')}
                codes={GENDERS}
                selected={field.value ? [field.value] : []}
                labelOf={(c) => t(`codes.gender.${c}`)}
                onPress={field.onChange}
              />
              {errors.gender && <Text variant="caption" color="danger">{fieldError(errors.gender.message)}</Text>}
            </View>
          )}
        />
      </StepScroll>
      <StepFooter onPress={submit} saving={saving} error={error} />
    </>
  );
}
