import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { Button, ErrorState, Screen } from '@/components/ui';
import { Splash } from '@/components/Splash';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { decideRoute } from '@/lib/guard';
import { loadAppearance } from '@/lib/appearance';
import { loadDeviceLocale } from '@/lib/i18n';
import { queryClient } from '@/lib/query';
import { useTheme } from '@/theme/useTheme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    Promise.all([loadDeviceLocale(), loadAppearance()]).finally(() => setLocaleReady(true));
    // Our own <Splash/> is on screen from the first render, so the native splash can go.
    SplashScreen.hideAsync();
  }, []);
  // On font failure, continue with the system font rather than hang on the splash.
  const bootReady = (fontsLoaded || !!fontError) && localeReady;

  // Gesture root: the (app) drawer's swipe needs it.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Guard bootReady={bootReady} />
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function Guard({ bootReady }: { bootReady: boolean }) {
  const { guard, retry, signOut, session } = useAuth();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const route = decideRoute({ bootReady, ...guard });
  // Signed out: drop the previous user's cached data from memory.
  const userId = session?.user.id;
  useEffect(() => { if (!userId) queryClient.clear(); }, [userId]);

  if (route === 'loading') return <Splash />;
  if (route === 'error') {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState onRetry={retry} title={t('error.title')} message={t('error.message')} retryLabel={t('common.retry')} />
          <Button title={t('common.signOut')} variant="ghost" onPress={signOut} />
        </View>
      </Screen>
    );
  }

  // Stack.Protected removes the groups the user may not see and moves them to the allowed one.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={route === 'auth'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'onboarding'}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'verify'}>
        <Stack.Screen name="verify" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'reset-password'}>
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={route === 'app'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
