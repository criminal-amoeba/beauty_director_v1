import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Chip } from '@/components/ui';
import { LOCALE_NAMES, LOCALES, setLocale } from '@/lib/i18n';
import { useTheme } from '@/theme/useTheme';

// "English | 繁體中文": instant switch, saved on device and (signed in) in user_settings.
export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { i18n } = useTranslation();
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {LOCALES.map((l) => (
        <Chip key={l} label={LOCALE_NAMES[l]} size={compact ? 'sm' : 'md'} selected={i18n.language === l} onPress={() => setLocale(l)} />
      ))}
    </View>
  );
}
