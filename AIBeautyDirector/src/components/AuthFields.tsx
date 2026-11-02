import { useState } from 'react';
import { Controller, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { FlatList, useWindowDimensions, View } from 'react-native';
import { Check, ChevronDown, CircleAlert, CloudOff, Construction, Mail, Smartphone } from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Chip, Input, PressableScale, Sheet, Text } from '@/components/ui';
import {
  COUNTRIES, dialCode, type AuthErrorKey, type CountryCode, type IdentityInput, type PhoneValue, type ValidationKey,
} from '@/features/auth/schemas';
import type { Method } from '@/lib/auth-context';
import { useTheme } from '@/theme/useTheme';
import { SHOW_EMAIL_AUTH } from '@/lib/flags';

export function MethodToggle({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  const { t } = useTranslation();
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Chip label={t('auth.methodEmail')} icon={Mail} selected={value === 'email'} onPress={() => onChange('email')} />
      <Chip label={t('auth.methodPhone')} icon={Smartphone} selected={value === 'phone'} onPress={() => onChange('phone')} />
    </View>
  );
}

// Countries alphabetical in the UI language, cached per language. One Intl.Collator: localeCompare(b, lang)
// builds a collator per call (~2,000 ICU calls per sort on Hermes Android), which stalled every PhoneField mount.
const sortCache = new Map<string, { code: CountryCode; dial: string; name: string }[]>();
function sortedCountries(lang: string, t: TFunction) {
  let list = sortCache.get(lang);
  if (!list) {
    const collator = new Intl.Collator(lang);
    list = COUNTRIES.map((c) => ({ ...c, name: t(`codes.country.${c.code}`) })).sort((a, b) => collator.compare(a.name, b.name));
    sortCache.set(lang, list);
  }
  return list;
}

// Phone input with a country code picker in the same row.
export function PhoneField({ value, onChange, error }: { value: PhoneValue; onChange: (v: PhoneValue) => void; error?: string }) {
  const { t, i18n } = useTranslation();
  const { colors, space, radii, layout } = useTheme();
  const { height } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dial = dialCode(value.country);
  const close = () => { setOpen(false); setQuery(''); };

  // Search matches the name, ISO code or calling code. The sorted list is only built once the sheet opens.
  const q = query.trim().toLowerCase().replace(/^\+/, '');
  const countries = open
    ? sortedCountries(i18n.language, t).filter(
        (c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q || c.dial.startsWith(q))
    : [];

  const picker = (
    <PressableScale
      onPress={() => setOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={`${t('auth.country')}: ${t(`codes.country.${value.country}`)} +${dial}`}
      style={{
        minHeight: layout.minTouch + space.xs,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        borderRadius: radii.sm,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}>
      <Text>{`${value.country} +${dial}`}</Text>
      <ChevronDown size={16} color={colors.textMuted} />
    </PressableScale>
  );

  return (
    <>
      <Input
        label={t('auth.phone')}
        leading={picker}
        value={value.national}
        onChangeText={(national) => onChange({ ...value, national })}
        keyboardType="phone-pad"
        autoComplete="tel-national"
        textContentType="telephoneNumber"
        error={error}
        helper={t(value.country === 'TW' ? 'auth.phoneHelperTW' : 'auth.phoneHelper')}
      />
      <Sheet visible={open} onClose={close} title={t('auth.countryTitle')} closeLabel={t('common.close')}>
        <Input label={t('auth.countrySearch')} value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" />
        {/* Fixed height so the sheet doesn't jump while filtering. */}
        <FlatList
          style={{ height: height * 0.5 }}
          data={countries}
          keyExtractor={(c) => c.code}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text color="textMuted">{t('auth.countryNone')}</Text>}
          renderItem={({ item: c }) => {
            const selected = c.code === value.country;
            return (
              <PressableScale
                onPress={() => { onChange({ ...value, country: c.code }); close(); }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={{ minHeight: layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Text style={{ flex: 1 }}>{c.name}</Text>
                <Text color="textMuted">{`+${c.dial}`}</Text>
                <View style={{ width: space.xl }}>{selected && <Check size={20} color={colors.primary} />}</View>
              </PressableScale>
            );
          }}
        />
      </Sheet>
    </>
  );
}

// Email | Phone toggle plus the active field. Use inside a <FormProvider> whose form extends IdentityInput.
export function IdentityFields({ onMethodChange }: { onMethodChange?: () => void }) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const { control } = useFormContext<IdentityInput>();
  // Hook subscriptions (not watch()/formState reads): React Compiler memoizes this component against parent re-renders.
  const method = useWatch({ control, name: 'method' });
  const { errors } = useFormState({ control });
  return (
    <>
      {SHOW_EMAIL_AUTH && (
        <Controller
          control={control}
          name="method"
          render={({ field }) => <MethodToggle value={field.value} onChange={(m) => { field.onChange(m); onMethodChange?.(); }} />}
        />
      )}
      {method === 'email' ? (
        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <Input
              label={t('auth.email')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              error={fieldError(errors.email?.message)}
            />
          )}
        />
      ) : (
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneField value={field.value} onChange={field.onChange} error={fieldError(errors.phone?.national?.message)} />
          )}
        />
      )}
    </>
  );
}

// Form-level error (auth failure) or offline notice, announced to screen readers.
export function FormBanner({ error }: { error: AuthErrorKey | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  const offline = error === 'auth.errors.network';
  return <Banner icon={offline ? CloudOff : CircleAlert} tone={offline ? 'text' : 'danger'} text={t(error)} />;
}

// Informational notice, e.g. a feature that is temporarily unavailable.
export const Notice = ({ text }: { text: string }) => <Banner icon={Construction} tone="text" text={text} />;

function Banner({ icon: Icon, tone, text }: { icon: typeof CircleAlert; tone: 'text' | 'danger'; text: string }) {
  const { colors, space, radii } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: space.sm, padding: space.md, borderRadius: radii.sm, backgroundColor: colors.surfaceMuted }}>
      <Icon size={20} color={tone === 'danger' ? colors.danger : colors.textMuted} />
      <Text style={{ flex: 1 }} color={tone}>{text}</Text>
    </View>
  );
}

export function OrDivider() {
  const { t } = useTranslation();
  const { colors, space } = useTheme();
  const line = <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {line}
      <Text variant="caption" color="textMuted">{t('auth.or')}</Text>
      {line}
    </View>
  );
}

// Field error from react-hook-form (an i18n key) → translated text.
export function useFieldError() {
  const { t } = useTranslation();
  return (message?: string) => (message ? t(message as ValidationKey) : undefined);
}
