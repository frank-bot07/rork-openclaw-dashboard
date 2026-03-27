import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Colors from '@/constants/colors';
import type { ConnectionState } from '@/types/openclaw';

type StatusTone = {
  backgroundColor: string;
  borderColor: string;
  dotColor: string;
  label: string;
  textColor: string;
};

const STATUS_TONES: Record<ConnectionState, StatusTone> = {
  idle: {
    label: 'Idle',
    backgroundColor: 'rgba(106, 106, 136, 0.12)',
    borderColor: 'rgba(106, 106, 136, 0.2)',
    dotColor: Colors.textMuted,
    textColor: Colors.textSecondary,
  },
  connecting: {
    label: 'Connecting',
    backgroundColor: Colors.primaryGlow,
    borderColor: 'rgba(77, 154, 255, 0.18)',
    dotColor: Colors.primary,
    textColor: Colors.primaryBright,
  },
  connected: {
    label: 'Connected',
    backgroundColor: Colors.successGlow,
    borderColor: 'rgba(34, 221, 136, 0.18)',
    dotColor: Colors.success,
    textColor: Colors.success,
  },
  reconnecting: {
    label: 'Reconnecting',
    backgroundColor: Colors.warningGlow,
    borderColor: 'rgba(255, 184, 68, 0.2)',
    dotColor: Colors.warning,
    textColor: Colors.warning,
  },
  disconnected: {
    label: 'Disconnected',
    backgroundColor: 'rgba(106, 106, 136, 0.12)',
    borderColor: 'rgba(106, 106, 136, 0.2)',
    dotColor: Colors.textMuted,
    textColor: Colors.textSecondary,
  },
  unauthorized: {
    label: 'Unauthorized',
    backgroundColor: Colors.errorGlow,
    borderColor: 'rgba(255, 85, 102, 0.2)',
    dotColor: Colors.error,
    textColor: Colors.error,
  },
  offline: {
    label: 'Offline',
    backgroundColor: 'rgba(106, 106, 136, 0.12)',
    borderColor: 'rgba(106, 106, 136, 0.2)',
    dotColor: Colors.textMuted,
    textColor: Colors.textSecondary,
  },
  error: {
    label: 'Error',
    backgroundColor: Colors.errorGlow,
    borderColor: 'rgba(255, 85, 102, 0.2)',
    dotColor: Colors.error,
    textColor: Colors.error,
  },
};

interface ConnectionStatusBadgeProps {
  state: ConnectionState;
}

export default function ConnectionStatusBadge({ state }: ConnectionStatusBadgeProps) {
  const tone = STATUS_TONES[state] ?? STATUS_TONES.disconnected;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone.backgroundColor,
          borderColor: tone.borderColor,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: tone.dotColor }]} />
      <Text style={[styles.label, { color: tone.textColor }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
});
