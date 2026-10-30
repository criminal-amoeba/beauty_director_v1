import { useState } from 'react';
import { View } from 'react-native';
import { Controller, useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, Text } from '@/components/ui';
import { FormBanner, useFieldError } from '@/components/AuthFields';
import { setPasswordSchema, type AuthErrorKey } from '@/features/auth/schemas';
import { useAuth } from '@/lib/auth-context';
import { zodResolver } from '@/lib/zod-resolver';
import { useTheme } from '@/theme/useTheme';

// Reached only with a recovery session (reset code or link). Saving clears recovering; the guard moves on.
export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { space } = useTheme();
  const { updatePassword, cancelRecovery } = useAuth();
  const fieldError = useFieldError();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });
  const { errors, isSubmitting } = useFormState({ control });

  const submit = handleSubmit(async ({ password }) => setFormError(await updatePassword(password)));

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="display">{t('reset.newTitle')}</Text>
          <Text color="textMuted">{t('reset.newMessage')}</Text>
        </View>
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Input
              label={t('auth.password')}
              helper={t('auth.passwordHelper')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              error={fieldError(errors.password?.message)}
            />
          )}
        />
        <Controller
          control={control}
          name="confirm"
          render={({ field }) => (
            <Input
              label={t('auth.confirmPassword')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={submit}
              error={fieldError(errors.confirm?.message)}
            />
          )}
        />
        <FormBanner error={formError} />
        <Button title={t('reset.save')} onPress={submit} loading={isSubmitting} />
        <Button title={t('reset.cancel')} variant="ghost" onPress={cancelRecovery} />
      </View>
    </Screen>
  );
}
