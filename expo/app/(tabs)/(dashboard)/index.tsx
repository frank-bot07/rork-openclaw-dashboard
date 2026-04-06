import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, RefreshControl, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, Activity, Wifi, WifiOff, Bot, MessageSquare, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import { useOverview } from '@/hooks/useOverview';
import { getAgentColor, getStatusRingColor } from '@/constants/agentColors';
import StatusDot from '@/components/StatusDot';
import FloatingChatButton from '@/components/FloatingChatButton';
import ErrorStateCard from '@/components/ErrorStateCard';
import ActivityFeed from '@/components/ActivityFeed';
import { DashboardSkeleton } from '@/components/SkeletonLoader';
import { useSessionStore } from '@/stores/sessionStore';

export default function DashboardScreen() {
  const { client, agents, heartbeats, isRefreshing, refreshData } = useOpenClaw();
  const overview = useOverview(client);
  const gatewayUrl = useSessionStore((state) => state.gatewayUrl);
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

  const gatewayStatus = overview.data?.gateway;
  const onlineAgents = useMemo(() => agents.filter(a => a.status !== 'offline'), [agents]);
  const primaryAgent = useMemo(
    () =>
      overview.data?.coordinator ??
      agents.find((agent) => agent.isCoordinator || agent.role === 'coordinator') ??
      agents.find((agent) => agent.status === 'online') ??
      agents[0],
    [agents, overview.data?.coordinator]
  );
  const healthyHeartbeats = heartbeats.filter(h => h.status === 'healthy').length;
  const isOverviewLoading = overview.isLoading && !overview.data;

  const handleAgentPress = useCallback((agentId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/agent/${agentId}`);
  }, [router]);

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
              {gatewayUrl && (
                <Text style={styles.serverLabel}>{gatewayUrl}</Text>
              )}
            </View>
            <View style={styles.statusChip}>
              {isOverviewLoading ? (
                <Wifi size={13} color={Colors.warning} />
              ) : gatewayStatus?.online ? (
                <Wifi size={13} color={Colors.success} />
              ) : (
                <WifiOff size={13} color={Colors.error} />
              )}
              <Text
                style={[
                  styles.statusChipText,
                  {
                    color: isOverviewLoading
                      ? Colors.warning
                      : gatewayStatus?.online
                        ? Colors.success
                        : Colors.error,
                  },
                ]}
              >
                {isOverviewLoading ? 'Connecting...' : gatewayStatus?.online ? 'Live' : 'Offline'}
              </Text>
            </View>
          </View>

          {isOverviewLoading ? (
            <DashboardSkeleton style={styles.connectingCard} />
          ) : overview.error && !overview.data ? (
            <ErrorStateCard
              style={styles.connectingCard}
              title="Overview unavailable"
              message={overview.error instanceof Error ? overview.error.message : 'Unable to load gateway overview.'}
              onRetry={() => void overview.refetch()}
            />
          ) : null}

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
                      {primaryAgent.avatar ?? primaryAgent.name[0]}
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
              <Text style={[styles.statNumber, { color: Colors.primary }]}>
                {gatewayStatus?.totalAgents ?? agents.length}
              </Text>
              <Text style={styles.statLabel}>Agents</Text>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[Colors.successGlow, 'transparent']}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              />
              <Text style={[styles.statNumber, { color: Colors.success }]}>
                {gatewayStatus?.onlineAgents ?? onlineAgents.length}
              </Text>
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
              <Text style={[styles.statNumber, { color: Colors.cyber }]}>
                {gatewayStatus?.activeChannels ?? '--'}
              </Text>
              <Text style={styles.statLabel}>Channels</Text>
            </View>
          </View>

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
                      <Text style={[styles.agentAvatarText, { color: accentColor.text }]}>
                        {agent.avatar ?? agent.name[0]}
                      </Text>
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

          {overview.data?.activity && overview.data.activity.length > 0 && (
            <ActivityFeed
              activities={overview.data.activity}
              onAgentPress={handleAgentPress}
            />
          )}

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
                    <Text style={styles.healthValue}>{gatewayStatus?.activeChannels ?? '--'}</Text>
                    <Text style={styles.healthLabel}>Channels</Text>
                  </View>
                </View>
                <View style={styles.healthDivider} />
                <View style={styles.healthStat}>
                  <MessageSquare size={16} color={Colors.accent} />
                  <View>
                    <Text style={styles.healthValue}>{gatewayStatus?.pendingJobs ?? '--'}</Text>
                    <Text style={styles.healthLabel}>Jobs</Text>
                  </View>
                </View>
              </View>
              <View style={styles.uptimeRow}>
                <Text style={styles.uptimeLabel}>Uptime: {gatewayStatus?.uptime ?? '--'}</Text>
                <Text style={styles.uptimeVersion}>{gatewayStatus ? `v${gatewayStatus.version}` : 'v--'}</Text>
              </View>
            </View>
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
  connectingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
    marginBottom: 20,
  },
  connectingTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 6,
  },
  connectingText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
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
});
