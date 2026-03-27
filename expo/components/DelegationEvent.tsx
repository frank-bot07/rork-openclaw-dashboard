import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ArrowRightLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { ChatMessage } from '@/types/openclaw';

interface DelegationEventProps {
  message: ChatMessage;
}

export default React.memo(function DelegationEvent({ message }: DelegationEventProps) {
  const details = useMemo(() => {
    const metadata = message.metadata ?? {};
    const targetName =
      getString(metadata.toAgentName) ??
      getString(metadata.agentName) ??
      getString(metadata.name) ??
      'specialist';
    const sourceName = getString(metadata.fromAgentName);
    const summary = getString(metadata.summary);

    return {
      targetName,
      sourceName,
      summary,
    };
  }, [message.metadata]);

  return (
    <View style={styles.row}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <ArrowRightLeft size={15} color={Colors.accent} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Delegated to {details.targetName}</Text>
          {details.sourceName ? (
            <Text style={styles.subtitle}>Requested by {details.sourceName}</Text>
          ) : null}
          {details.summary ? (
            <Text style={styles.summary}>{details.summary}</Text>
          ) : null}
        </View>
        <Text style={styles.time}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
});

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const styles = StyleSheet.create({
  row: {
    marginBottom: 14,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accentGlowStrong,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  summary: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  time: {
    color: Colors.textDim,
    fontSize: 11,
    marginTop: 2,
  },
});
