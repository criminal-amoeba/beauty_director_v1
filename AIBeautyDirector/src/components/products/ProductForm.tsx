import { View } from 'react-native';
import { Controller, useForm, useFormState } from 'react-hook-form';
import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Input, Text } from '@/components/ui';
import { FormBanner, useFieldError } from '@/components/AuthFields';
import { ChipGroup, toggle } from '@/components/onboarding/parts';
import type { AuthErrorKey } from '@/features/auth/schemas';
import { CATEGORIES, KEY_ACTIVES, PRODUCT_STATUSES, USE_TIMES } from '@/features/onboarding/codes';
import { productFormSchema, type ProductFormInput } from '@/features/products/schemas';
import { zodResolver } from '@/lib/zod-resolver';
import { useTheme } from '@/theme/useTheme';

type Props = {
  initial: ProductFormInput;
  onSubmit: (v: ProductFormInput) => void;
  saving?: boolean;
  error?: AuthErrorKey | null;
  // compact: onboarding asks only name + brand + category; the rest keeps its defaults.
  compact?: boolean;
  // Existing rows can change status; new ones start active.
  showStatus?: boolean;
  submitLabel: string;
  submitIcon?: LucideIcon;
  submitVariant?: 'primary' | 'secondary';
  // Extra check before submit; return an i18n key to show on the name field (e.g. duplicates).
  validate?: (v: ProductFormInput) => string | null;
};

export function ProductForm({ initial, onSubmit, saving, error, compact, showStatus, submitLabel, submitIcon, submitVariant = 'primary', validate }: Props) {
  const { t } = useTranslation();
  const { space } = useTheme();
  const fieldError = useFieldError();
  const { control, handleSubmit, setError } = useForm({ resolver: zodResolver(productFormSchema), defaultValues: initial });
  const { errors } = useFormState({ control });

  const submit = handleSubmit((v) => {
    const issue = validate?.(v);
    if (issue) return setError('name', { message: issue });
    onSubmit(v);
  });

  return (
    <View style={{ gap: space.lg }}>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            label={t('onboarding.products.name')}
            helper={t('onboarding.products.nameHelper')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            maxLength={120}
            autoCapitalize="words"
            error={fieldError(errors.name?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="brand"
        render={({ field }) => (
          <Input label={t('onboarding.products.brand')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} maxLength={80} autoCapitalize="words" error={fieldError(errors.brand?.message)} />
        )}
      />
      <Controller
        control={control}
        name="category"
        render={({ field }) => (
          <View style={{ gap: space.xs }}>
            <ChipGroup label={t('onboarding.products.category')} codes={CATEGORIES} selected={field.value ? [field.value] : []} labelOf={(c) => t(`codes.category.${c}`)} onPress={field.onChange} />
            {errors.category && <Text variant="caption" color="danger">{fieldError(errors.category.message)}</Text>}
          </View>
        )}
      />
      {!compact && (
        <>
          <Controller
            control={control}
            name="use_time"
            render={({ field }) => (
              <ChipGroup label={t('products.useTime')} codes={USE_TIMES} selected={[field.value]} labelOf={(c) => t(`codes.useTime.${c}`)} onPress={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="key_actives"
            render={({ field }) => (
              <View style={{ gap: space.xs }}>
                <ChipGroup label={t('products.actives')} codes={KEY_ACTIVES} selected={field.value} labelOf={(c) => t(`codes.actives.${c}`)} onPress={(c) => field.onChange(toggle(field.value, c))} />
                <Text variant="caption" color="textMuted">{t('products.activesHelper')}</Text>
              </View>
            )}
          />
          <Controller
            control={control}
            name="ingredients_text"
            render={({ field }) => (
              <Input
                label={t('products.ingredients')}
                helper={t('products.ingredientsHelper')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                multiline
                numberOfLines={4}
                maxLength={2000}
                textAlignVertical="top"
                error={fieldError(errors.ingredients_text?.message)}
              />
            )}
          />
          <Controller
            control={control}
            name="opened_at"
            render={({ field }) => (
              <Input
                label={t('products.openedAt')}
                helper={t('products.openedAtHelper')}
                placeholder="YYYY-MM-DD"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                error={fieldError(errors.opened_at?.message)}
              />
            )}
          />
          {showStatus && (
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <ChipGroup label={t('products.status')} codes={PRODUCT_STATUSES} selected={[field.value]} labelOf={(c) => t(`codes.productStatus.${c}`)} onPress={field.onChange} />
              )}
            />
          )}
        </>
      )}
      <FormBanner error={error ?? null} />
      <Button title={submitLabel} icon={submitIcon} variant={submitVariant} onPress={submit} loading={saving} />
    </View>
  );
}
