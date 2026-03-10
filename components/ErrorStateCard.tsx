import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface ErrorStateCardProps {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export default function ErrorStateCard({
  title,
  message,
  onRetry,
  retryLabel = 'Retry',
  style,
}: ErrorStateCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.accent} />
      <View style={styles.iconWrap}>
        <AlertTriangle size={18} color={Colors.error} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
      {onRetry ? (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryLabel}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 85, 102, 0.18)',
    backgroundColor: Colors.errorGlow,
    padding: 16,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.error,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 85, 102, 0.12)',
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.error,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
  },
  retryLabel: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
  },
});
