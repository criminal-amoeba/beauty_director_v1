import { Stack } from 'expo-router';
import { useTheme } from '@/theme/useTheme';

// Home is the stack root, even on a deep link, so back from any child returns to Home.
export const unstable_settings = { initialRouteName: 'index' };

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTitle: '',
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.primary,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
