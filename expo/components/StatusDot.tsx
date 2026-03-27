import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface StatusDotProps {
  status: 'online' | 'offline' | 'busy' | 'healthy' | 'degraded' | 'down';
  size?: number;
  pulse?: boolean;
}

const statusColorMap: Record<string, string> = {
  online: Colors.cyber,
  healthy: Colors.success,
  busy: Colors.warning,
  degraded: Colors.warning,
  offline: Colors.textMuted,
  down: Colors.error,
};

const statusGlowMap: Record<string, string> = {
  online: Colors.cyberGlow,
  healthy: Colors.successGlow,
  busy: Colors.warningGlow,
  degraded: Colors.warningGlow,
  offline: 'transparent',
  down: Colors.errorGlow,
};

export default React.memo(function StatusDot({ status, size = 10, pulse = true }: StatusDotProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const color = statusColorMap[status] ?? Colors.textMuted;
  const glow = statusGlowMap[status] ?? 'transparent';
  const shouldPulse = pulse && (status === 'online' || status === 'healthy');

  useEffect(() => {
    if (shouldPulse) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 2.2, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [shouldPulse, pulseAnim]);

  return (
    <View style={[styles.container, { width: size * 2.4, height: size * 2.4 }]}>
      {shouldPulse && (
        <Animated.View
          style={[
            styles.pulse,
            {
              width: size * 2.4,
              height: size * 2.4,
              borderRadius: size * 1.2,
              backgroundColor: glow,
              transform: [{ scale: pulseAnim }],
              opacity: pulseAnim.interpolate({
                inputRange: [1, 2.2],
                outputRange: [0.6, 0],
              }),
            },
          ]}
        />
      )}
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
  },
  dot: {},
});
