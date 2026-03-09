import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { OpenClawProvider } from "@/providers/OpenClawProvider";
import ErrorBoundary from "@/components/ErrorBoundary";
import Colors from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="agent/[id]"
        options={{ headerShown: true, title: "Agent" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

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
