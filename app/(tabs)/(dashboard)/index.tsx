import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Activity, Wifi, WifiOff, Bot, MessageSquare, ArrowRight, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import { getAgentColor, getStatusRingColor } from '@/constants/agentColors';
import StatusDot from '@/components/StatusDot';
import FloatingChatButton from '@/components/FloatingChatButton';
import { QuickAction } from '@/types/openclaw';

export default function DashboardScreen() {
  const {
    agents, gatewayStatus, heartbeats, activeProfile,
    isRefreshing, refreshData,
    activityFeed, quickActions, executeQuickAction,
  } = useOpenClaw();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 16, bounciness: 3, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const onlineAgents = useMemo(() => agents.filter(a => a.status !== 'offline'), [agents]);
  const primaryAgent = useMemo(() => agents.find(a => a.status === 'online') ?? agents[0], [agents]);
  const healthyHeartbeats = heartbeats.filter(h => h.status === 'healthy').length;

  const handleAgentPress = useCallback((agentId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/agent/${agentId}`);
  }, [router]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    executeQuickAction(action);
    router.push(`/agent/${action.agentId}`);
  }, [executeQuickAction, router]);

  const avgUptime = useMemo(() => {
    if (heartbeats.length === 0) return 0;
    return heartbeats.reduce((sum, hb) => sum + hb.uptimePercent, 0) / heartbeats.length;
  }, [heartbeats]);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshData}
            tintColor={Colors.cyber}
            colors={[Colors.cyber]}
          />
        }
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.greeting}>Mission Control</Text>
              {activeProfile && (
                <Text style={styles.serverLabel}>{activeProfile.address}</Text>
              )}
            </View>
            <View style={styles.statusChip}>
              {gatewayStatus.online ? (
                <Wifi size={13} color={Colors.success} />
              ) : (
                <WifiOff size={13} color={Colors.error} />
              )}
              <Text style={[styles.statusChipText, { color: gatewayStatus.online ? Colors.success : Colors.error }]}>
                {gatewayStatus.online ? 'Live' : 'Offline'}
              </Text>
            </View>
          </View>

          {primaryAgent && (
            <Pressable
              onPress={() => handleAgentPress(primaryAgent.id)}
              testID="hero-chat-btn"
              style={({ pressed }) => [styles.heroCard, pressed && { transform: [{ scale: 0.97 }] }]}
            >
              <LinearGradient
                colors={['rgba(77, 154, 255, 0.15)', 'rgba(0, 223, 186, 0.08)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
              />
              <View style={styles.heroTop}>
                <View style={styles.heroAgentInfo}>
                  <View style={[styles.heroAvatar, { backgroundColor: getAgentColor(primaryAgent.id).bg }]}>
                    <Text style={[styles.heroAvatarText, { color: getAgentColor(primaryAgent.id).text }]}>
                      {primaryAgent.name[0]}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.heroAgentName}>{primaryAgent.name}</Text>
                    <View style={styles.heroStatusRow}>
                      <StatusDot status={primaryAgent.status} size={6} />
                      <Text style={styles.heroStatusText}>
                        {primaryAgent.status === 'online' ? 'Ready to chat' : primaryAgent.status === 'busy' ? 'Processing...' : 'Offline'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.heroCta}>
                  <LinearGradient
                    colors={[Colors.primary, Colors.accent]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroCtaGradient}
                  >
                    <ArrowRight size={20} color="#000" strokeWidth={2.5} />
                  </LinearGradient>
                </View>
              </View>
              <Text style={styles.heroDesc}>{primaryAgent.description}</Text>
              <View style={styles.heroHint}>
                <MessageSquare size={13} color={Colors.textMuted} />
                <Text style={styles.heroHintText}>Tap to start chatting instantly</Text>
              </View>
            </Pressable>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[Colors.primaryGlow, 'transparent']}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              />
              <Text style={[styles.statNumber, { color: Colors.primary }]}>{agents.length}</Text>
              <Text style={styles.statLabel}>Agents</Text>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[Colors.successGlow, 'transparent']}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              />
              <Text style={[styles.statNumber, { color: Colors.success }]}>{onlineAgents.length}</Text>
              <Text style={styles.statLabel}>Online</Text>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[Colors.accentGlow, 'transparent']}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              />
              <Text style={[styles.statNumber, { color: Colors.accent }]}>{avgUptime.toFixed(0)}%</Text>
              <Text style={styles.statLabel}>Uptime</Text>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[Colors.cyberGlow, 'transparent']}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              />
              <Text style={[styles.statNumber, { color: Colors.cyber }]}>{gatewayStatus.activeChannels}</Text>
              <Text style={styles.statLabel}>Channels</Text>
            </View>
          </View>

          {quickActions.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>One-Tap Actions</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActionsScroll}>
                {quickActions.slice(0, 6).map((action) => (
                  <Pressable
                    key={action.id}
                    style={({ pressed }) => [styles.quickActionCard, pressed && { transform: [{ scale: 0.95 }], opacity: 0.85 }]}
                    onPress={() => handleQuickAction(action)}
                    testID={`quick-action-${action.id}`}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: action.glow }]}>
                      <Zap size={16} color={action.color} />
                    </View>
                    <Text style={styles.quickActionLabel} numberOfLines={1}>{action.label}</Text>
                    <Text style={styles.quickActionDesc} numberOfLines={1}>{action.description}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your Agents</Text>
              <Pressable
                style={styles.seeAllBtn}
                onPress={() => router.push('/(tabs)/agents')}
                hitSlop={12}
              >
                <Text style={styles.seeAllText}>See all</Text>
                <ChevronRight size={14} color={Colors.primary} />
              </Pressable>
            </View>

            {agents.slice(0, 4).map((agent) => {
              const accentColor = getAgentColor(agent.id);
              const ringColor = getStatusRingColor(agent.status);
              const statusLabel = agent.status === 'online' ? 'Online' : agent.status === 'busy' ? 'Busy' : 'Offline';

              return (
                <Pressable
                  key={agent.id}
                  style={({ pressed }) => [styles.agentCard, pressed && { backgroundColor: Colors.surfaceElevated, transform: [{ scale: 0.98 }] }]}
                  onPress={() => handleAgentPress(agent.id)}
                  testID={`agent-card-${agent.id}`}
                >
                  <View style={styles.agentRow}>
                    <View style={[styles.agentAvatar, { backgroundColor: accentColor.bg, borderColor: ringColor }]}>
                      <Text style={[styles.agentAvatarText, { color: accentColor.text }]}>{agent.name[0]}</Text>
                    </View>
                    <View style={styles.agentInfo}>
                      <Text style={styles.agentName}>{agent.name}</Text>
                      <Text style={styles.agentDesc} numberOfLines={1}>{agent.description}</Text>
                    </View>
                    <View style={styles.agentRight}>
                      <View style={[styles.agentStatusBadge, {
                        backgroundColor: agent.status === 'online' ? Colors.successGlow
                          : agent.status === 'busy' ? Colors.warningGlow
                          : 'rgba(100, 100, 130, 0.10)',
                      }]}>
                        <StatusDot status={agent.status} size={5} pulse={agent.status === 'online'} />
                        <Text style={[styles.agentStatusText, {
                          color: agent.status === 'online' ? Colors.success
                            : agent.status === 'busy' ? Colors.warning
                            : Colors.textMuted,
                        }]}>{statusLabel}</Text>
                      </View>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>System Health</Text>
            <View style={styles.healthCard}>
              <View style={styles.healthRow}>
                <View style={styles.healthStat}>
                  <Activity size={16} color={Colors.success} />
                  <View>
                    <Text style={styles.healthValue}>{healthyHeartbeats}/{heartbeats.length}</Text>
                    <Text style={styles.healthLabel}>Healthy</Text>
                  </View>
                </View>
                <View style={styles.healthDivider} />
                <View style={styles.healthStat}>
                  <Bot size={16} color={Colors.primary} />
                  <View>
                    <Text style={styles.healthValue}>{gatewayStatus.activeChannels}</Text>
                    <Text style={styles.healthLabel}>Channels</Text>
                  </View>
                </View>
                <View style={styles.healthDivider} />
                <View style={styles.healthStat}>
                  <MessageSquare size={16} color={Colors.accent} />
                  <View>
                    <Text style={styles.healthValue}>{gatewayStatus.pendingJobs}</Text>
                    <Text style={styles.healthLabel}>Jobs</Text>
                  </View>
                </View>
              </View>
              <View style={styles.uptimeRow}>
                <Text style={styles.uptimeLabel}>Uptime: {gatewayStatus.uptime}</Text>
                <Text style={styles.uptimeVersion}>v{gatewayStatus.version}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            {activityFeed.slice(0, 5).map((activity) => (
              <Pressable
                key={activity.id}
                style={styles.activityRow}
                onPress={() => handleAgentPress(activity.agentId)}
              >
                <View style={styles.activityLeft}>
                  <View style={[styles.activityDot, {
                    backgroundColor: activity.type === 'alert' ? Colors.warning
                      : activity.type === 'message' ? Colors.primary
                      : activity.type === 'task' ? Colors.accent
                      : Colors.textMuted,
                  }]} />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle}>{activity.title}</Text>
                    <Text style={styles.activityDetail} numberOfLines={1}>{activity.agentName} · {activity.detail}</Text>
                  </View>
                </View>
                <ChevronRight size={14} color={Colors.textDim} />
              </Pressable>
            ))}
          </View>

          <View style={{ height: 120 }} />
        </Animated.View>
      </ScrollView>

      <FloatingChatButton agents={agents} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  greeting: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  serverLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginTop: 4,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(77, 154, 255, 0.18)',
    padding: 20,
    marginBottom: 20,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroAgentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  heroAgentName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  heroStatusText: {
    color: Colors.success,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  heroCta: {
    marginLeft: 12,
  },
  heroCtaGradient: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDesc: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  heroHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroHintText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    alignItems: 'center',
    overflow: 'hidden',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    marginBottom: 14,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginBottom: 14,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  quickActionsScroll: {
    gap: 10,
    paddingRight: 20,
  },
  quickActionCard: {
    width: 140,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickActionLabel: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    marginBottom: 3,
  },
  quickActionDesc: {
    color: Colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  agentCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 8,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  agentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentAvatarText: {
    fontSize: 17,
    fontWeight: '800' as const,
  },
  agentInfo: {
    flex: 1,
  },
  agentName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  agentDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  agentRight: {
    alignItems: 'flex-end',
  },
  agentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
  },
  agentStatusText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  healthCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  healthStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.cardBorder,
    marginHorizontal: 6,
  },
  healthValue: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  healthLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  uptimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  uptimeLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  uptimeVersion: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  activityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  activityDetail: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
});
