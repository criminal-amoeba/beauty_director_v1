import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui';
import { useTheme } from '@/theme/useTheme';

// Shown while fonts, session and profile load. No Text: fonts may not be loaded yet.
export function Splash() {
  const { colors, space, radii } = useTheme();
  const { t } = useTranslation();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('splash.loading')}
      style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
      <Skeleton width={space.xxxl * 2} height={space.xxxl * 2} radius={radii.full} />
      <Skeleton width="50%" height={space.lg} />
      <Skeleton width="35%" height={space.md} />
    </View>
  );
}
