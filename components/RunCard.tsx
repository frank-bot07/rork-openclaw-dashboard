import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { Bot, Clock, RotateCcw } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import PressableCard from '@/components/PressableCard';
import type { RunStatus, RunSummary } from '@/types/openclaw';

interface RunCardProps {
  run: RunSummary;
  onPress: () => void;
  onRetry?: (run: RunSummary) => void;
  isRetrying?: boolean;
}

const STATUS_STYLES: Record<
  RunStatus,
  {
    label: string;
    color: string;
    backgroundColor: string;
    borderColor: string;
  }
> = {
  queued: {
    label: 'Queued',
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.cardBorder,
  },
  running: {
    label: 'Running',
    color: Colors.primary,
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primaryGlowStrong,
  },
  succeeded: {
    label: 'Succeeded',
    color: Colors.success,
    backgroundColor: Colors.successGlow,
    borderColor: Colors.successGlowStrong,
  },
  failed: {
    label: 'Failed',
    color: Colors.error,
    backgroundColor: Colors.errorGlow,
    borderColor: 'rgba(255, 85, 102, 0.28)',
  },
  cancelled: {
    label: 'Cancelled',
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceLight,
    borderColor: Colors.cardBorder,
  },
  degraded: {
    label: 'Degraded',
    color: Colors.warning,
    backgroundColor: Colors.warningGlow,
    borderColor: 'rgba(255, 184, 68, 0.28)',
  },
};

export default function RunCard({ run, onPress, onRetry, isRetrying = false }: RunCardProps) {
  const pulseAnim = useRef(new Animated.Value(0.55)).current;
  const statusStyle = STATUS_STYLES[run.status] ?? STATUS_STYLES.queued;
  const isActive = run.status === 'queued' || run.status === 'running';
  const isFailed = run.status === 'failed';
  const showRetry = isFailed && Boolean(run.canRetry) && Boolean(onRetry);
  const startedLabel = useMemo(
    () => formatTimeAgo(run.startedAt ?? run.createdAt),
    [run.createdAt, run.startedAt]
  );
  const durationLabel = useMemo(() => formatDuration(run), [run]);
  const triggerLabel = useMemo(() => resolveTriggerLabel(run), [run]);

  useEffect(() => {
    if (run.status !== 'running') {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0.55);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();

    return () => {
      loop.stop();
      pulseAnim.stopAnimation();
    };
  }, [pulseAnim, run.status]);

  const handleRetryPress = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onRetry?.(run);
  };

  return (
    <PressableCard
      onPress={onPress}
      style={[
        styles.card,
        isActive && styles.cardActive,
        isFailed && styles.cardFailed,
      ]}
      testID={`run-card-${run.id}`}
    >
      <View
        style={[
          styles.accentRail,
          {
            backgroundColor: isFailed
              ? Colors.error
              : run.status === 'running'
                ? Colors.primary
                : run.status === 'succeeded'
                  ? Colors.success
                  : run.status === 'degraded'
                    ? Colors.warning
                    : Colors.cardBorder,
          },
        ]}
      />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {run.title}
            </Text>
            <View style={styles.agentRow}>
              <Bot size={13} color={Colors.textMuted} />
              <Text style={styles.agentName} numberOfLines={1}>
                {run.agentName || 'Unknown agent'}
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: statusStyle.backgroundColor,
                borderColor: statusStyle.borderColor,
              },
            ]}
          >
            <Animated.View
              style={[
                styles.statusDot,
                {
                  backgroundColor: statusStyle.color,
                  opacity: run.status === 'running' ? pulseAnim : 1,
                  transform: [
                    {
                      scale:
                        run.status === 'running'
                          ? pulseAnim.interpolate({
                              inputRange: [0.4, 1],
                              outputRange: [0.92, 1.18],
                            })
                          : 1,
                    },
                  ],
                },
              ]}
            />
            <Text style={[styles.statusText, { color: statusStyle.color }]}>
              {statusStyle.label}
            </Text>
          </View>
        </View>

        <Text
          style={[styles.summary, isFailed && styles.summaryFailed]}
          numberOfLines={run.errorMessage ? 3 : 2}
        >
          {run.errorMessage || run.summary}
        </Text>

        <View style={styles.metaRow}>
          <MetaItem label="Trigger" value={triggerLabel} />
          <MetaItem label="Started" value={startedLabel} icon={<Clock size={12} color={Colors.textDim} />} />
          <MetaItem label="Duration" value={durationLabel} />
        </View>

        {showRetry ? (
          <View style={styles.actionsRow}>
            <Pressable
              style={styles.retryButton}
              onPress={handleRetryPress}
              disabled={isRetrying}
              testID={`run-retry-${run.id}`}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.retryGradient}
              >
                {isRetrying ? (
                  <ActivityIndicator color="#000" size="small" />
                ) : (
                  <>
                    <RotateCcw size={15} color="#000" strokeWidth={2.4} />
                    <Text style={styles.retryText}>Retry</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}
      </View>
    </PressableCard>
  );
}

function MetaItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <View style={styles.metaValueRow}>
        {icon}
        <Text style={styles.metaValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function formatDuration(run: RunSummary) {
  if (run.status === 'queued' || run.status === 'running') {
    return 'Running...';
  }

  const durationMs =
    run.durationMs ??
    (run.startedAt && run.completedAt
      ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
      : null);

  if (!durationMs || durationMs < 1_000) {
    return 'Under 1s';
  }

  const totalSeconds = Math.floor(durationMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatTimeAgo(timestamp: string | null | undefined) {
  if (!timestamp) {
    return 'Unknown';
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function resolveTriggerLabel(run: RunSummary) {
  const metadata = run.metadata ?? {};
  const candidates = [
    metadata.triggerType,
    metadata.trigger,
    metadata.source,
    metadata.origin,
  ];

  const trigger = candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (trigger) {
    return humanizeTrigger(trigger);
  }

  if ((run.delegatedAgentNames?.length ?? 0) > 0) {
    return 'Delegated';
  }

  if (run.conversationId) {
    return 'Conversation';
  }

  return 'Manual';
}

function humanizeTrigger(input: string) {
  return input
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  cardActive: {
    borderColor: 'rgba(77, 154, 255, 0.22)',
  },
  cardFailed: {
    borderColor: 'rgba(255, 85, 102, 0.24)',
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  content: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    gap: 8,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentName: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 13,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summary: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  summaryFailed: {
    color: Colors.error,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flex: 1,
    minWidth: 92,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  metaLabel: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  metaValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaValue: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  retryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  retryGradient: {
    minWidth: 108,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  retryText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
});
