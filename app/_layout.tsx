import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRootNavigationState, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { OpenClawProvider } from "@/providers/OpenClawProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import Colors from "@/constants/colors";
import { openClawAuth } from "@/lib/openclaw/auth";
import { useSessionStore } from "@/stores/sessionStore";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const rootNavigationState = useRootNavigationState();
  const restoreSession = useSessionStore((state) => state.restoreSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const session = useSessionStore((state) => state.session);
  const connectionState = useSessionStore((state) => state.connectionState);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const bootstrapSession = async () => {
      try {
        const storedSession = await openClawAuth.getSession();

        if (!isMounted) {
          return;
        }

        if (storedSession) {
          restoreSession(storedSession);
        } else {
          clearSession();
        }
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
  }, [clearSession, restoreSession]);

  useEffect(() => {
    if (isBootstrapping || !rootNavigationState?.key) {
      return;
    }

    const currentRoute = segments[0];
    const isConnectRoute = currentRoute === 'connect';
    const hasAuthorizedSession =
      Boolean(session) && connectionState !== 'unauthorized' && connectionState !== 'disconnected';

    if (!hasAuthorizedSession && !isConnectRoute) {
      router.replace('/connect');
      return;
    }

    if (hasAuthorizedSession && isConnectRoute) {
      router.replace('/(tabs)');
    }
  }, [connectionState, isBootstrapping, rootNavigationState?.key, router, segments, session]);

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
          letterSpacing: -0.3,
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
