import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Colors from '@/constants/colors';

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function SkeletonBlock({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmerAnim, { toValue: 0.25, duration: 900, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: Colors.shimmer,
          opacity: shimmerAnim,
        },
        style,
      ]}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonBlock width="100%" height={76} borderRadius={16} style={styles.mb16} />
      <SkeletonBlock width="100%" height={56} borderRadius={14} style={styles.mb20} />

      <View style={styles.statsRow}>
        <SkeletonBlock width="23%" height={100} borderRadius={14} />
        <SkeletonBlock width="23%" height={100} borderRadius={14} />
        <SkeletonBlock width="23%" height={100} borderRadius={14} />
        <SkeletonBlock width="23%" height={100} borderRadius={14} />
      </View>

      <SkeletonBlock width="100%" height={110} borderRadius={16} style={styles.mb16} />
      <SkeletonBlock width={80} height={20} borderRadius={6} style={styles.mb12} />
      <SkeletonBlock width="100%" height={80} borderRadius={14} style={styles.mb10} />
      <SkeletonBlock width="100%" height={80} borderRadius={14} style={styles.mb10} />
      <SkeletonBlock width="100%" height={80} borderRadius={14} style={styles.mb10} />
    </View>
  );
}

export function AgentListSkeleton() {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.agentSkeletonCard}>
          <View style={styles.agentSkeletonTop}>
            <SkeletonBlock width={50} height={50} borderRadius={15} />
            <View style={styles.agentSkeletonMeta}>
              <SkeletonBlock width={120} height={16} borderRadius={6} />
              <SkeletonBlock width={180} height={12} borderRadius={4} style={styles.mt6} />
            </View>
          </View>
          <View style={styles.agentSkeletonBottom}>
            <SkeletonBlock width="30%" height={14} borderRadius={4} />
            <SkeletonBlock width="30%" height={14} borderRadius={4} />
            <SkeletonBlock width="30%" height={14} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function SchedulerSkeleton() {
  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.schedulerSkeletonCard}>
          <View style={styles.schedulerSkeletonRow}>
            <SkeletonBlock width={38} height={38} borderRadius={11} />
            <View style={styles.schedulerSkeletonMeta}>
              <SkeletonBlock width={140} height={14} borderRadius={6} />
              <SkeletonBlock width={90} height={10} borderRadius={4} style={styles.mt6} />
            </View>
            <SkeletonBlock width={48} height={28} borderRadius={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  mb20: {
    marginBottom: 20,
  },
  mb16: {
    marginBottom: 16,
  },
  mb12: {
    marginBottom: 12,
  },
  mb10: {
    marginBottom: 10,
  },
  mt6: {
    marginTop: 6,
  },
  agentSkeletonCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 12,
  },
  agentSkeletonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agentSkeletonMeta: {
    flex: 1,
  },
  agentSkeletonBottom: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    gap: 16,
  },
  schedulerSkeletonCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 10,
  },
  schedulerSkeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  schedulerSkeletonMeta: {
    flex: 1,
  },
});
