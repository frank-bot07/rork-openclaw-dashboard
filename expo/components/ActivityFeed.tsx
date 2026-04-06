import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  MessageSquare, Zap, AlertTriangle, Settings, Radio,
  ChevronRight,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ActivityEntry, ActivityType } from '@/types/openclaw';
import { formatTimeAgo } from '@/lib/datetime';

const ACTIVITY_ICONS: Record<ActivityType, React.ComponentType<{ size: number; color: string }>> = {
  message: MessageSquare,
  task: Zap,
  alert: AlertTriangle,
  system: Settings,
  channel: Radio,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  message: Colors.primary,
  task: Colors.accent,
  alert: Colors.warning,
  system: '#7C5CE7',
  channel: Colors.success,
};

interface ActivityFeedProps {
  activities: ActivityEntry[];
  onAgentPress: (agentId: string) => void;
  maxItems?: number;
}

function ActivityRow({ activity, onAgentPress }: { activity: ActivityEntry; onAgentPress: (id: string) => void }) {
  const Icon = ACTIVITY_ICONS[activity.type];
  const color = ACTIVITY_COLORS[activity.type];
  const timeAgo = useMemo(() => formatTimeAgo(activity.timestamp), [activity.timestamp]);

  const handlePress = useCallback(() => {
    onAgentPress(activity.agentId);
  }, [activity.agentId, onAgentPress]);

  return (
    <Pressable style={styles.row} onPress={handlePress} testID={`activity-${activity.id}`}>
      <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
        <Icon size={15} color={color} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{activity.title}</Text>
        <Text style={styles.detail} numberOfLines={1}>{activity.agentName} · {activity.detail}</Text>
      </View>
      <View style={styles.rightCol}>
        <Text style={styles.time}>{timeAgo}</Text>
        <ChevronRight size={14} color={Colors.textDim} />
      </View>
    </Pressable>
  );
}

export default React.memo(function ActivityFeed({ activities, onAgentPress, maxItems = 8 }: ActivityFeedProps) {
  const visibleActivities = useMemo(() => activities.slice(0, maxItems), [activities, maxItems]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Activity Feed</Text>
      {visibleActivities.map((activity) => (
        <ActivityRow
          key={activity.id}
          activity={activity}
          onAgentPress={onAgentPress}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  detail: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  time: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '500' as const,
  },
});
