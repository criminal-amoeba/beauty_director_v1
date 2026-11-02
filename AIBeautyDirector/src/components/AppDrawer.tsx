import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { LayoutGrid, LogOut, Package, Settings, UserRound, X, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, PressableScale, Text } from '@/components/ui';
import { useHome } from '@/features/routine/hooks';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/theme/useTheme';

function Row({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  const { colors, space, radii, layout } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: layout.minTouch + space.sm, paddingHorizontal: space.md, borderRadius: radii.sm }}>
      <Icon size={22} color={colors.textMuted} />
      <Text variant="label" style={{ flex: 1 }}>{label}</Text>
    </PressableScale>
  );
}

export function AppDrawer({ navigation }: DrawerContentComponentProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { colors, space, layout } = useTheme();
  const name = useHome().data?.name ?? '';
  const go = (href: Href) => {
    navigation.closeDrawer();
    router.push(href);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, paddingHorizontal: layout.screenPaddingCompact, paddingVertical: space.lg, gap: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Avatar name={name} size="lg" />
        <Text variant="h2" style={{ flex: 1 }} numberOfLines={2}>{name}</Text>
        <PressableScale
          onPress={() => navigation.closeDrawer()}
          accessibilityRole="button"
          accessibilityLabel={t('drawer.close')}
          style={{ width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' }}>
          <X size={22} color={colors.textMuted} />
        </PressableScale>
      </View>
      <View style={{ gap: space.xs }}>
        <Row icon={UserRound} label={t('drawer.profile')} onPress={() => go('/profile')} />
        <Row icon={Package} label={t('drawer.products')} onPress={() => go('/products')} />
        <Row icon={Settings} label={t('drawer.settings')} onPress={() => go('/settings')} />
        {__DEV__ && <Row icon={LayoutGrid} label={t('drawer.gallery')} onPress={() => go('/gallery')} />}
      </View>
      <View style={{ flex: 1 }} />
      <Row icon={LogOut} label={t('common.signOut')} onPress={signOut} />
    </SafeAreaView>
  );
}
