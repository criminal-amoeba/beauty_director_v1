import { useState } from 'react';
import { View } from 'react-native';
import { Monitor, Moon, Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Chip } from '@/components/ui';
import { APPEARANCES, currentAppearance, setAppearance, type AppearanceChoice } from '@/lib/appearance';
import { useTheme } from '@/theme/useTheme';

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

// "Match device | Light | Dark": instant, saved on this device.
export function AppearanceSwitch() {
  const { t } = useTranslation();
  const { space } = useTheme();
  const [choice, setChoice] = useState<AppearanceChoice>(currentAppearance);
  const pick = (c: AppearanceChoice) => { setChoice(c); setAppearance(c); };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {APPEARANCES.map((c) => (
        <Chip key={c} label={t(`settings.appearanceOptions.${c}`)} icon={ICONS[c]} selected={choice === c} onPress={() => pick(c)} />
      ))}
    </View>
  );
}
