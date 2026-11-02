import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, FormProvider, useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, Text } from '@/components/ui';
import { FormBanner, IdentityFields, OrDivider, useFieldError } from '@/components/AuthFields';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { LegalNotice } from '@/components/LegalLinks';
import { emptyIdentity, loginSchema, type AuthErrorKey } from '@/features/auth/schemas';
import { useAuth } from '@/lib/auth-context';
import { zodResolver } from '@/lib/zod-resolver';
import { useTheme } from '@/theme/useTheme';
import { SHOW_EMAIL_AUTH } from '@/lib/flags';

// Success (or an unconfirmed account) changes auth state; the root guard moves on.
export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
  const { signIn, signInWithLine } = useAuth();
  const fieldError = useFieldError();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [lineBusy, setLineBusy] = useState(false);
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { ...emptyIdentity, method: SHOW_EMAIL_AUTH ? 'email' as const : 'phone' as const, password: '' },
  });
  const { control, handleSubmit } = form;
  const { errors, isSubmitting } = useFormState({ control });

  const submit = handleSubmit(async (credentials) => setFormError(await signIn(credentials)));
  const line = async () => {
    setLineBusy(true);
    setFormError(await signInWithLine());
    setLineBusy(false);
  };

  return (
    <Screen>
      <FormProvider {...form}>
        <View style={{ alignItems: 'flex-end' }}>
          <LanguageSwitch compact />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <View style={{ gap: space.xs }}>
            <Text variant="display">{t('auth.loginTitle')}</Text>
            <Text color="textMuted">{t('auth.tagline')}</Text>
          </View>
          <IdentityFields onMethodChange={() => setFormError(null)} />
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <Input
                label={t('auth.password')}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                onSubmitEditing={submit}
                error={fieldError(errors.password?.message)}
              />
            )}
          />
          <FormBanner error={formError} />
          <Button title={t('auth.signIn')} onPress={submit} loading={isSubmitting} />
          <Button title={t('auth.forgot')} variant="ghost" onPress={() => router.push('/forgot-password')} />
          <OrDivider />
          <Button title={t('auth.line')} variant="secondary" onPress={line} loading={lineBusy} />
          <LegalNotice />
          <Button title={`${t('auth.noAccount')} ${t('auth.toSignUp')}`} variant="ghost" onPress={() => router.push('/sign-up')} />
        </View>
      </FormProvider>
    </Screen>
  );
}
