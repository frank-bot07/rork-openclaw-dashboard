import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Newspaper, ShieldCheck, Search, ScrollText, Activity, Code,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { QuickAction } from '@/types/openclaw';

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Newspaper,
  ShieldCheck,
  Search,
  ScrollText,
  Activity,
  Code,
};

interface QuickActionsProps {
  actions: QuickAction[];
  onAction: (action: QuickAction) => void;
}

function QuickActionCard({ action, onAction }: { action: QuickAction; onAction: (a: QuickAction) => void }) {
  const Icon = ICON_MAP[action.icon] ?? Activity;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAction(action);
  }, [action, onAction]);

  return (
    <Pressable
      onPress={handlePress}
      testID={`quick-action-${action.id}`}
      style={styles.card}
    >
      <View style={[styles.iconWrap, { backgroundColor: action.glow }]}>
        <Icon size={20} color={action.color} />
      </View>
      <Text style={styles.label} numberOfLines={1}>{action.label}</Text>
      <Text style={styles.desc} numberOfLines={2}>{action.description}</Text>
    </Pressable>
  );
}

export default React.memo(function QuickActions({ actions, onAction }: QuickActionsProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <QuickActionCard key={action.id} action={action} onAction={onAction} />
        ))}
      </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '48%' as unknown as number,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  label: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  desc: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
});
