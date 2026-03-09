import { Stack } from 'expo-router';
import Colors from '@/constants/colors';

export default function AgentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '700' as const },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}
