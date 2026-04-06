import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Bot } from 'lucide-react-native';
import Colors from '@/constants/colors';
import PressableCard from '@/components/PressableCard';
import type { Incident, IncidentSeverity } from '@/types/openclaw';
import { formatTimeAgo } from '@/lib/datetime';

interface IncidentCardProps {
  incident: Incident;
  onPress?: () => void;
}

const SEVERITY_STYLES: Record<
  IncidentSeverity,
  {
    label: string;
    color: string;
    backgroundColor: string;
    borderColor: string;
  }
> = {
  critical: {
    label: 'Critical',
    color: Colors.error,
    backgroundColor: Colors.errorGlow,
    borderColor: 'rgba(255, 85, 102, 0.24)',
  },
  warning: {
    label: 'Warning',
    color: Colors.warning,
    backgroundColor: Colors.warningGlow,
    borderColor: 'rgba(255, 184, 68, 0.24)',
  },
  info: {
    label: 'Info',
    color: Colors.primary,
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primaryGlowStrong,
  },
};

export default function IncidentCard({ incident, onPress }: IncidentCardProps) {
  const severityStyle = SEVERITY_STYLES[incident.severity] ?? SEVERITY_STYLES.info;
  const affectedResource = incident.agentName || incident.metadata?.resourceName || 'Gateway';

  return (
    <PressableCard
      onPress={onPress}
      style={[styles.card, { borderColor: severityStyle.borderColor }]}
      testID={`incident-card-${incident.id}`}
    >
      <View style={[styles.accentRail, { backgroundColor: severityStyle.color }]} />

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={[styles.iconWrap, { backgroundColor: severityStyle.backgroundColor }]}>
            <AlertTriangle size={16} color={severityStyle.color} />
          </View>

          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {incident.title}
            </Text>
            <Text style={styles.description} numberOfLines={2}>
              {incident.summary}
            </Text>
          </View>

          <View
            style={[
              styles.severityBadge,
              {
                backgroundColor: severityStyle.backgroundColor,
                borderColor: severityStyle.borderColor,
              },
            ]}
          >
            <Text style={[styles.severityText, { color: severityStyle.color }]}>
              {severityStyle.label}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Affected</Text>
            <View style={styles.metaValueRow}>
              <Bot size={12} color={Colors.textDim} />
              <Text style={styles.metaValue} numberOfLines={1}>
                {typeof affectedResource === 'string' ? affectedResource : 'Gateway'}
              </Text>
            </View>
          </View>

          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Created</Text>
            <Text style={styles.metaValue}>{formatTimeAgo(incident.createdAt)}</Text>
          </View>
        </View>
      </View>
    </PressableCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 0,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
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
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    flex: 1,
    minWidth: 118,
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
});
