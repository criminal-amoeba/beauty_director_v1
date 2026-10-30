import { useState } from 'react';
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input, Screen, Sheet, Text } from '@/components/ui';
import { FormBanner, Notice, PhoneField } from '@/components/AuthFields';
import { toE164, type AuthErrorKey, type PhoneValue } from '@/features/auth/schemas';
import { identitiesOf, linkLine, linkPhone, verifyPhoneLink } from '@/features/profile/identities';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/theme/useTheme';

type MethodAction = { label: string; onPress: () => void; loading?: boolean; disabled?: boolean };

function Method({ title, value, action }: { title: string; value: string | null; action?: MethodAction }) {
  const { t } = useTranslation();
  const { space } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: space.xs }}>
          <Text variant="label">{title}</Text>
          <Text variant="caption" color="textMuted">{value ?? t('profile.notLinked')}</Text>
        </View>
        {value ? <Check size={20} /> : action && <Button title={action.label} variant="secondary" onPress={action.onPress} loading={action.loading} disabled={action.disabled} />}
      </View>
    </Card>
  );
}

// Sign-in methods on this account and how to add one. Linking never creates a second account: Supabase adds the
// identity to the signed-in user after it is verified (SMS code for phone, LINE's own consent for LINE).
export default function ProfileMethodsScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const ids = identitiesOf(session?.user);
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [busy, setBusy] = useState<'line' | 'phone' | 'code' | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState<PhoneValue>({ country: 'TW', national: '' });
  const [e164, setE164] = useState<string | null>(null); // set once the code was sent
  const [code, setCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const addLine = async () => {
    setBusy('line');
    setError(await linkLine());
    setBusy(null);
  };
  const sendCode = async () => {
    const value = toE164(phone.country, phone.national);
    if (!value) return setPhoneError(t('auth.validation.phone'));
    setPhoneError(undefined);
    setBusy('phone');
    const err = await linkPhone(value);
    setBusy(null);
    setError(err);
    if (!err) setE164(value);
  };
  const verify = async () => {
    if (!e164) return;
    setBusy('code');
    const err = await verifyPhoneLink(e164, code.trim());
    setBusy(null);
    setError(err);
    if (!err) { setPhoneOpen(false); setE164(null); setCode(''); }
  };

  return (
    <Screen edges={['bottom']}>
      <Text variant="h1">{t('profile.methodsTitle')}</Text>
      <Method title={t('auth.phone')} value={ids.phone ? `+${ids.phone}` : null} action={{ label: t('profile.add'), onPress: () => setPhoneOpen(true) }} />
      <Method title={t('auth.line')} value={ids.line ? t('profile.linked') : null} action={{ label: t('profile.add'), onPress: addLine, loading: busy === 'line' }} />
      <Method title={t('auth.email')} value={ids.email} action={{ label: t('profile.add'), onPress: () => {}, disabled: true }} />
      {!ids.email && <Notice text={t('profile.emailSoon')} />}
      <FormBanner error={error} />
      <Sheet visible={phoneOpen} onClose={() => { if (!busy) setPhoneOpen(false); }} title={t('profile.phoneTitle')} closeLabel={t('common.close')}>
        {e164 ? (
          <>
            <Text>{t('profile.codeMessage')}</Text>
            <Input label={t('verify.codeLabel')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" textContentType="oneTimeCode" />
            <Button title={t('verify.submit')} onPress={verify} loading={busy === 'code'} disabled={code.trim().length !== 6} />
          </>
        ) : (
          <>
            <Text>{t('profile.phoneMessage')}</Text>
            <PhoneField value={phone} onChange={setPhone} error={phoneError} />
            <Button title={t('profile.sendCode')} onPress={sendCode} loading={busy === 'phone'} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}
