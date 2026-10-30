import { Stack } from 'expo-router';
import { useTheme } from '@/theme/useTheme';

export const unstable_settings = { initialRouteName: 'login' };

export default function AuthLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
