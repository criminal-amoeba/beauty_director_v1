import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { Controller, FormProvider, useForm, useFormState } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button, Input, Screen, Text } from '@/components/ui';
import { FormBanner, IdentityFields, useFieldError } from '@/components/AuthFields';
import { codeSchema, emptyIdentity, resetRequestSchema, type AuthErrorKey } from '@/features/auth/schemas';
import { mmss, resendWaitSeconds } from '@/lib/auth-link';
import { useAuth, type Method } from '@/lib/auth-context';
import { useNow } from '@/lib/use-now';
import { zodResolver } from '@/lib/zod-resolver';
import { useTheme } from '@/theme/useTheme';
import { SHOW_EMAIL_AUTH } from '@/lib/flags';

type Target = { method: Method; id: string; sentAt: number };

// Step 1: email or phone → code. Step 2: code → signed in with recovering = true; the guard opens reset-password.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { space } = useTheme();
  const [target, setTarget] = useState<Target | null>(null);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <Text variant="display">{t('reset.title')}</Text>
          <Text color="textMuted">{target ? t('reset.sent', { id: target.id }) : t('reset.message')}</Text>
        </View>
        {target ? (
          <CodeStep target={target} onResent={(sentAt) => setTarget({ ...target, sentAt })} onBack={() => setTarget(null)} />
        ) : (
          <RequestStep onSent={(method, id) => setTarget({ method, id, sentAt: Date.now() })} />
        )}
        <Button title={t('reset.back')} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function RequestStep({ onSent }: { onSent: (method: Method, id: string) => void }) {
  const { t } = useTranslation();
  const { requestPasswordReset } = useAuth();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const form = useForm({ resolver: zodResolver(resetRequestSchema), defaultValues: { ...emptyIdentity, method: SHOW_EMAIL_AUTH ? 'email' as const : 'phone' as const } });
  const { isSubmitting } = useFormState({ control: form.control });

  const submit = form.handleSubmit(async ({ method, id }) => {
    const error = await requestPasswordReset(method, id);
    setFormError(error);
    if (!error) onSent(method, id);
  });

  return (
    <FormProvider {...form}>
      <IdentityFields onMethodChange={() => setFormError(null)} />
      <FormBanner error={formError} />
      <Button title={t('reset.send')} onPress={submit} loading={isSubmitting} />
    </FormProvider>
  );
}

function CodeStep({ target, onResent, onBack }: { target: Target; onResent: (sentAt: number) => void; onBack: () => void }) {
  const { t } = useTranslation();
  const { space } = useTheme();
  const { requestPasswordReset, verifyPasswordReset } = useAuth();
  const fieldError = useFieldError();
  const now = useNow();
  const [formError, setFormError] = useState<AuthErrorKey | null>(null);
  const [sending, setSending] = useState(false);
  const { control, handleSubmit } = useForm({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });
  const { errors, isSubmitting } = useFormState({ control });
  const wait = resendWaitSeconds(target.sentAt, now);

  const submit = handleSubmit(async ({ code }) => setFormError(await verifyPasswordReset(target.method, target.id, code)));
  const resend = async () => {
    setSending(true);
    const error = await requestPasswordReset(target.method, target.id);
    setSending(false);
    setFormError(error);
    if (!error) onResent(Date.now());
  };

  return (
    <>
      <Controller
        control={control}
        name="code"
        render={({ field }) => (
          <Input
            label={t('reset.codeLabel')}
            value={field.value}
            onChangeText={(v) => field.onChange(v.replace(/\D/g, '').slice(0, 6))}
            onBlur={field.onBlur}
            keyboardType="number-pad"
            maxLength={6}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            onSubmitEditing={submit}
            error={fieldError(errors.code?.message)}
          />
        )}
      />
      <FormBanner error={formError} />
      <Button title={t('reset.verify')} onPress={submit} loading={isSubmitting} />
      <View style={{ gap: space.xs }}>
        <Button
          title={wait > 0 ? t('reset.resendIn', { time: mmss(wait) }) : t('reset.resend')}
          icon={RefreshCw}
          variant="secondary"
          onPress={resend}
          loading={sending}
          disabled={wait > 0}
        />
        <Button title={t('reset.changeId')} variant="ghost" onPress={onBack} />
      </View>
    </>
  );
}
