import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Controller, FormProvider, useForm, useFormState, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, Text } from '@/components/ui';
import { FormBanner, IdentityFields, Notice, OrDivider, useFieldError } from '@/components/AuthFields';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { LegalNotice } from '@/components/LegalLinks';
import { emptyIdentity, signUpSchema, type AuthErrorKey } from '@/features/auth/schemas';
import { useAuth } from '@/lib/auth-context';
import { zodResolver } from '@/lib/zod-resolver';
import { useTheme } from '@/theme/useTheme';

// Success remembers the unverified account (with the current locale); the root guard moves to onboarding.
export default function SignUpScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
  const { signUp, signInWithLine } = useAuth();
  const fieldError = useFieldError();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [lineBusy, setLineBusy] = useState(false);
  const form = useForm({
    resolver: zodResolver(signUpSchema),
    // Phone first while email sign-up is off.
    defaultValues: { ...emptyIdentity, method: 'phone' as const, password: '', confirm: '' },
  });
  const { control, handleSubmit } = form;
  const { errors, isSubmitting } = useFormState({ control });
  // shortcut: email sign-up is off until custom SMTP on a verified domain exists; drop this flag then.
  const emailOff = useWatch({ control, name: 'method' }) === 'email';

  const submit = handleSubmit(async (credentials) => {
    if (credentials.method !== 'email') setFormError(await signUp(credentials));
  });
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
            <Text variant="display">{t('auth.signUpTitle')}</Text>
            <Text color="textMuted">{t('auth.signUpSubtitle')}</Text>
          </View>
          <IdentityFields onMethodChange={() => setFormError(null)} />
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
          {emailOff && <Notice text={t('auth.emailSignUpSoon')} />}
          <FormBanner error={formError} />
          <Button title={t('auth.createAccount')} onPress={submit} loading={isSubmitting} disabled={emailOff} />
          <OrDivider />
          <Button title={t('auth.line')} variant="secondary" onPress={line} loading={lineBusy} />
          <LegalNotice />
          <Button title={`${t('auth.haveAccount')} ${t('auth.toLogin')}`} variant="ghost" onPress={() => router.dismissTo('/login')} />
        </View>
      </FormProvider>
    </Screen>
  );
}
