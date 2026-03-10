import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { openClawAuth } from '@/lib/openclaw/auth';
import { createStoredSessionClient } from '@/lib/openclaw/client';
import {
  buildSessionFromOverview,
  isUnauthorizedConnectionError,
  toConnectionErrorMessage,
} from '@/lib/openclaw/connection';
import { OpenClawProvider } from '@/providers/OpenClawProvider';
import { useSessionStore } from '@/stores/sessionStore';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const restoreSession = useSessionStore((state) => state.restoreSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const setConnected = useSessionStore((state) => state.setConnected);
  const setOffline = useSessionStore((state) => state.setOffline);
  const session = useSessionStore((state) => state.session);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      try {
        const storedSession = await openClawAuth.getSession();

        if (!isMounted) {
          return;
        }

        if (storedSession) {
          restoreSession({
            ...storedSession,
            connectionState: 'reconnecting',
          });

          try {
            const client = createStoredSessionClient({
              baseUrl: storedSession.gatewayUrl,
              retry: 0,
            });
            const overview = await client.getOverview();
            const validatedSession = buildSessionFromOverview(
              overview,
              storedSession.gatewayUrl,
              storedSession
            );

            await openClawAuth.saveSession(validatedSession);

            if (!isMounted) {
              return;
            }

            setConnected(validatedSession);
          } catch (error) {
            console.error('[Bootstrap] Failed to validate stored session.', error);

            if (!isMounted) {
              return;
            }

            if (isUnauthorizedConnectionError(error) || useSessionStore.getState().connectionState === 'unauthorized') {
              clearSession();
              return;
            }

            setOffline(toConnectionErrorMessage(error));
          }
        } else {
          clearSession();
        }
      } catch (error) {
        console.error('[Bootstrap] Failed to bootstrap session.', error);

        if (!isMounted) {
          return;
        }

        clearSession();
        setBootstrapError(
          error instanceof Error ? error : new Error('Failed to restore the stored session.')
        );
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }

        void SplashScreen.hideAsync();
      }
    };

    void bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, [clearSession, restoreSession, setConnected, setOffline]);

  if (bootstrapError) {
    throw bootstrapError;
  }

  useEffect(() => {
    if (isBootstrapping || !rootNavigationState?.key) {
      return;
    }

    const currentRoute = segments[0];
    const isConnectRoute = currentRoute === 'connect';
    const hasStoredSession = Boolean(session);

    if (!hasStoredSession && !isConnectRoute) {
      router.replace('/connect');
      return;
    }

    if (hasStoredSession && isConnectRoute) {
      router.replace('/(tabs)');
    }
  }, [isBootstrapping, rootNavigationState?.key, router, segments, session]);

  if (isBootstrapping) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerBackTitle: "Back",
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerShadowVisible: false,
        headerTitleStyle: {
          fontWeight: '700' as const,
        },
      }}
    >
      <Stack.Screen name="connect" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="agent/[id]"
        options={{ headerShown: true, title: "Agent" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary>
          <OpenClawProvider>
            <RootLayoutNav />
          </OpenClawProvider>
        </ErrorBoundary>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
