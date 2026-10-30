import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Checkbox, ErrorState, Screen, Skeleton, Text } from '@/components/ui';
import { LegalLinks } from '@/components/LegalLinks';
import { consentChange, useConsents, useSaveConsent, type ConsentState } from '@/features/consent/api';
import { PURPOSES } from '@/features/onboarding/codes';
import { isOffline } from '@/features/routine/api';
import { useTheme } from '@/theme/useTheme';

// Privacy & consent: Terms shown as accepted; photo analysis, training and marketing can change at any time.
// Each change appends one consents row (the log is insert-only). Past results stay; delete account removes them.
export default function PrivacyScreen() {
  const { t, i18n } = useTranslation();
  const { colors, space } = useTheme();
  const { data, error, isPending, refetch, isRefetching, userId } = useConsents();
  const save = useSaveConsent(userId);
  const date = (c: ConsentState) => new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(c.created_at));

  if (isPending) {
    return (
      <Screen edges={['bottom']}>
        <Skeleton width="60%" height={space.xxl} />
        <Skeleton height={space.xxxl * 3} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen edges={['bottom']}>
        <ErrorState offline={isOffline(error)} onRetry={() => refetch()} retrying={isRefetching} retryLabel={t('common.retry')} />
      </Screen>
    );
  }

  const terms = data.terms;
  const optional = PURPOSES.filter((p) => p !== 'terms');
  return (
    <Screen edges={['bottom']}>
      <Text variant="display">{t('privacy.title')}</Text>
      <Text color="textMuted">{t('privacy.intro')}</Text>

      <Card>
        <Text variant="label">{t('onboarding.consent.terms.title')}</Text>
        <Text variant="caption" color="textMuted">
          {terms?.granted ? t('privacy.accepted', { version: terms.policy_version, date: date(terms) }) : t('privacy.notRecorded')}
        </Text>
        <LegalLinks />
        <Text variant="caption" color="textMuted">{t('privacy.termsWithdraw')}</Text>
      </Card>

      <Card style={{ gap: 0, paddingVertical: space.xs }}>
        {optional.map((p, i) => {
          const c = data[p];
          const on = c?.granted ?? false;
          return (
            <View key={p} style={{ paddingVertical: space.sm, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}>
              <Checkbox
                label={t(`onboarding.consent.${p}.title`)}
                checked={on}
                disabled={save.isPending}
                onChange={(granted) => {
                  const row = consentChange(data, p, granted);
                  if (row) save.mutate(row);
                }}
              />
              {/* Indent = checkbox box + gap, so the detail lines up with the label (as in onboarding). */}
              <View style={{ paddingLeft: space.xl + space.md, gap: space.xs }}>
                <Text variant="caption" color="textMuted">{t(`onboarding.consent.${p}.body`)}</Text>
                {p === 'photo_analysis' && !on && <Text variant="caption">{t('privacy.photoOff')}</Text>}
                {c && <Text variant="caption" color="textMuted">{t('privacy.changed', { date: date(c) })}</Text>}
              </View>
            </View>
          );
        })}
      </Card>
      {save.error && <Text variant="caption" color="danger">{t(isOffline(save.error) ? 'auth.errors.network' : 'auth.errors.generic')}</Text>}
    </Screen>
  );
}
