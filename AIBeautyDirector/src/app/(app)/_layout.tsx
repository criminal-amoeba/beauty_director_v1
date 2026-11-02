import { usePathname } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { AppDrawer } from '@/components/AppDrawer';
import { useReminderSync } from '@/features/settings/api';
import { useTheme } from '@/theme/useTheme';

export const unstable_settings = { initialRouteName: '(main)' };

// The drawer is a menu over the Home-rooted stack in (main): its items push onto that stack, so back
// still returns to Home. Swipe-to-open only on Home, so it never competes with a screen's back gesture.
export default function AppLayout() {
  const { colors } = useTheme();
  const onHome = usePathname() === '/';
  useReminderSync();
  return (
    <Drawer
      drawerContent={(props) => <AppDrawer {...props} />}
      screenOptions={{
        headerShown: false,
        swipeEnabled: onHome,
        overlayColor: colors.scrim,
        drawerStyle: { backgroundColor: colors.surface },
      }}>
      <Drawer.Screen name="(main)" />
    </Drawer>
  );
}
