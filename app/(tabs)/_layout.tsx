import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Animated, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, Bot, Clock, Settings } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import Colors from '@/constants/colors';

function AnimatedTabIcon({ Icon, focused }: { Icon: typeof LayoutDashboard; focused: boolean }) {
  const scaleAnim = useRef(new Animated.Value(focused ? 1.05 : 0.92)).current;
  const opacityAnim = useRef(new Animated.Value(focused ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: focused ? 1.05 : 0.92, useNativeDriver: true, speed: 24, bounciness: focused ? 12 : 4 }),
      Animated.timing(opacityAnim, { toValue: focused ? 1 : 0.5, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [focused, scaleAnim, opacityAnim]);

  return (
    <View style={tabIconStyles.wrapper}>
      <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: opacityAnim }}>
        <Icon size={24} color={focused ? Colors.primary : Colors.tabBarInactive} strokeWidth={focused ? 2.2 : 1.8} />
      </Animated.View>
      {focused && <View style={tabIconStyles.activeDot} />}
    </View>
  );
}

const tabIconStyles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 40,
    gap: 5,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.primary,
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarStyle: {
          position: 'absolute' as const,
          backgroundColor: Platform.OS === 'web' ? 'rgba(8, 8, 16, 0.94)' : 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          paddingTop: 8,
        },
        tabBarBackground: () => Platform.OS !== 'web' ? (
          <BlurView
            tint="dark"
            intensity={80}
            style={[StyleSheet.absoluteFill, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.tabBarBorder }]}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 8, 16, 0.94)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.tabBarBorder }]} />
        ),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
          letterSpacing: 0.2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="(dashboard)"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <AnimatedTabIcon Icon={LayoutDashboard} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="agents"
        options={{
          title: 'Agents',
          tabBarIcon: ({ focused }) => <AnimatedTabIcon Icon={Bot} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="scheduler"
        options={{
          title: 'Scheduler',
          tabBarIcon: ({ focused }) => <AnimatedTabIcon Icon={Clock} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <AnimatedTabIcon Icon={Settings} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
