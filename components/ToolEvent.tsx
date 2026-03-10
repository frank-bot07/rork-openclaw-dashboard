import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Hammer, Wrench } from 'lucide-react-native';
import Colors from '@/constants/colors';
import type { ChatMessage } from '@/types/openclaw';

interface ToolEventProps {
  message: ChatMessage;
}

export default React.memo(function ToolEvent({ message }: ToolEventProps) {
  const details = useMemo(() => {
    const metadata = message.metadata ?? {};
    const toolName =
      getString(metadata.toolName) ??
      getString(metadata.name) ??
      'tool';
    const phase = getString(metadata.phase);

    return {
      toolName,
      phase,
    };
  }, [message.metadata]);

  return (
    <View style={styles.row}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          {details.phase === 'completed' ? (
            <Hammer size={15} color={Colors.primary} />
          ) : (
            <Wrench size={15} color={Colors.primaryBright} />
          )}
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>Used {details.toolName}</Text>
          {details.phase ? (
            <Text style={styles.subtitle}>
              {details.phase === 'completed' ? 'Completed' : 'In progress'}
            </Text>
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
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primaryGlowStrong,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primaryGlow,
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
    color: Colors.textMuted,
    fontSize: 12,
  },
  time: {
    color: Colors.textDim,
    fontSize: 11,
  },
});
