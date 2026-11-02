import { useState } from 'react';
import { Keyboard, View } from 'react-native';
import { MailCheck, RefreshCw, Smartphone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Input, Screen, Text } from '@/components/ui';
import { mmss, resendWaitSeconds } from '@/lib/auth-link';
import { useNow } from '@/lib/use-now';
import type { AuthErrorKey } from '@/features/auth/schemas';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/theme/useTheme';

const CODE_LENGTH = 6; // must match Supabase Auth → Email OTP length (SMS codes are 6 digits)

// Link in the email signs in automatically (handled in AuthProvider); the code is the fallback. Success = the guard moves on.
export default function VerifyScreen() {
  const { pending, signOut, discardAccount, verifyCode, resendVerification, linkError } = useAuth();
  const { t } = useTranslation();
  const { space } = useTheme();
  const now = useNow();
  const [code, setCode] = useState('');
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const wait = resendWaitSeconds(pending?.sentAt ?? 0, now);
  const phone = pending?.method === 'phone';

  const submit = async () => {
    Keyboard.dismiss(); // close it before the guard swaps in Onboarding, so the next screen starts without it
    setVerifying(true);
    const result = await verifyCode(code);
    setVerifying(false);
    if (result) setError(result);
  };

  const resend = async () => {
    setSending(true);
    const result = await resendVerification();
    setSending(false);
    setSent(!result);
    setError(result);
  };

  // Only reachable if console email confirmation is off: nothing to verify here, so offer a way out.
  if (!pending) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.sm }}>
          <EmptyState icon={MailCheck} title={t('verify.titleGeneric')} message={t('verify.messageGeneric')} />
          <Button title={t('common.signOut')} variant="secondary" onPress={signOut} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        <EmptyState
          icon={phone ? Smartphone : MailCheck}
          title={t(phone ? 'verify.titlePhone' : 'verify.titleEmail')}
          message={phone ? t('verify.messagePhone', { id: `+${pending.id}` }) : t('verify.message', { id: pending.id })}
        />
        {linkError && !sent && (
          <Text color="danger" style={{ textAlign: 'center' }}>{t('verify.errors.link_expired')}</Text>
        )}
        <Input
          label={t('verify.codeLabel')}
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH)); setError(null); }}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          error={error ? t(error) : undefined}
          onSubmitEditing={code.length === CODE_LENGTH ? submit : undefined}
        />
        <Button title={t('verify.submit')} onPress={submit} loading={verifying} disabled={code.length !== CODE_LENGTH} />
        <View style={{ gap: space.xs }}>
          <Button
            title={wait > 0 ? t('verify.resendIn', { time: mmss(wait) }) : t(phone ? 'verify.resendSms' : 'verify.resend')}
            icon={RefreshCw}
            variant="secondary"
            onPress={resend}
            loading={sending}
            disabled={wait > 0}
          />
          {sent && <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>{t(phone ? 'verify.sentSms' : 'verify.sent')}</Text>}
        </View>
        <Button title={t('verify.differentAccount')} variant="ghost" onPress={discardAccount} />
      </View>
    </Screen>
  );
}
