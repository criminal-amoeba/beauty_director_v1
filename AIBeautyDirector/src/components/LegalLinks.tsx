import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PressableScale, Sheet, Text } from '@/components/ui';
import { POLICY_VERSION } from '@/features/onboarding/codes';
import { useTheme } from '@/theme/useTheme';

type Doc = 'terms' | 'privacy';

// "Terms of Service · Privacy Policy" links, used on Login, Sign Up and the onboarding consent step.
// shortcut: opens a placeholder sheet until the documents are published; then open their URLs with expo-web-browser.
export function LegalLinks({ center = false }: { center?: boolean }) {
  const { t } = useTranslation();
  const { colors, space, layout } = useTheme();
  const [doc, setDoc] = useState<Doc>('terms');
  const [open, setOpen] = useState(false);

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, justifyContent: center ? 'center' : 'flex-start' }}>
        {(['terms', 'privacy'] as const).map((d) => (
          <PressableScale
            key={d}
            onPress={() => { setDoc(d); setOpen(true); }}
            accessibilityRole="link"
            accessibilityLabel={t(`legal.${d}.title`)}
            style={{ minHeight: layout.minTouch, justifyContent: 'center' }}>
            <Text variant="caption" style={{ color: colors.primary, textDecorationLine: 'underline' }}>{t(`legal.${d}.title`)}</Text>
          </PressableScale>
        ))}
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title={t(`legal.${doc}.title`)} closeLabel={t('common.close')}>
        <Text>{t('legal.placeholder')}</Text>
        <Text variant="caption" color="textMuted">{t('legal.version', { version: POLICY_VERSION })}</Text>
      </Sheet>
    </>
  );
}

// Login / Sign Up: "By continuing…" covers the phone, email and LINE buttons alike (data is collected before onboarding).
export function LegalNotice() {
  const { t } = useTranslation();
  return (
    <View>
      <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>{t('legal.notice')}</Text>
      <LegalLinks center />
    </View>
  );
}
