import { useState } from 'react';
import { Controller, useForm, useFormState } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, Text } from '@/components/ui';
import { FormBanner, useFieldError } from '@/components/AuthFields';
import { setPasswordSchema, type AuthErrorKey } from '@/features/auth/schemas';
import { useAuth } from '@/lib/auth-context';
import { zodResolver } from '@/lib/zod-resolver';
import { useTheme } from '@/theme/useTheme';

// Change password for a signed-in user (same rules as sign-up / reset). Supabase may answer samePassword.
export default function ProfilePasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
  const { updatePassword } = useAuth();
  const fieldError = useFieldError();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [saved, setSaved] = useState(false);
  const { control, handleSubmit } = useForm({ resolver: zodResolver(setPasswordSchema), defaultValues: { password: '', confirm: '' } });
  const { errors, isSubmitting } = useFormState({ control });

  const submit = handleSubmit(async ({ password }) => {
    const err = await updatePassword(password);
    setFormError(err);
    if (!err) setSaved(true);
  });

  return (
    <Screen edges={['bottom']}>
      <Text variant="h1">{t('profile.passwordTitle')}</Text>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input label={t('auth.password')} helper={t('auth.passwordHelper')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
            secureTextEntry autoComplete="new-password" textContentType="newPassword" error={fieldError(errors.password?.message)} />
        )}
      />
      <Controller
        control={control}
        name="confirm"
        render={({ field }) => (
          <Input label={t('auth.confirmPassword')} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
            secureTextEntry autoComplete="new-password" textContentType="newPassword" onSubmitEditing={submit} error={fieldError(errors.confirm?.message)} />
        )}
      />
      <FormBanner error={formError} />
      {saved ? (
        <>
          <Text color="success" style={{ marginTop: space.xs }}>{t('profile.passwordSaved')}</Text>
          <Button title={t('common.backHome')} variant="secondary" onPress={() => router.back()} />
        </>
      ) : (
        <Button title={t('reset.save')} onPress={submit} loading={isSubmitting} />
      )}
    </Screen>
  );
}
