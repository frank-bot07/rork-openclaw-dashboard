import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, AlertTriangle, Search, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import FloatingChatButton from '@/components/FloatingChatButton';
import IncidentCard from '@/components/IncidentCard';
import RunCard from '@/components/RunCard';
import Colors from '@/constants/colors';
import { useIncidents } from '@/hooks/useIncidents';
import { useRetryRun, useRuns } from '@/hooks/useRuns';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { safeInvalidateMany, safeInvalidateQueries } from '@/lib/openclaw/queryUtils';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import { useUIStore } from '@/stores/uiStore';
import type { Incident, RunSummary } from '@/types/openclaw';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'failed', label: 'Failed' },
  { key: 'succeeded', label: 'Succeeded' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

type FilterKey = typeof FILTER_OPTIONS[number]['key'];

export default function RunsScreen() {
  const { client, agents } = useOpenClaw();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const runsStatusFilter = useUIStore((state) => state.runsStatusFilter);
  const runsSearchQuery = useUIStore((state) => state.runsSearchQuery);
  const setRunsStatusFilter = useUIStore((state) => state.setRunsStatusFilter);
  const setRunsSearch = useUIStore((state) => state.setRunsSearch);

  const activeRunsQuery = useRuns(client, { status: ['queued', 'running'] });
  const failedRunsQuery = useRuns(client, { status: ['failed', 'degraded'] });
  const recentRunsQuery = useRuns(client);
  const incidentsQuery = useIncidents(client, { status: 'open' });
  const retryRunMutation = useRetryRun(client);

  const selectedFilter = FILTER_OPTIONS.some((option) => option.key === runsStatusFilter)
    ? (runsStatusFilter as FilterKey)
    : 'all';

  const activeRuns = useMemo(
    () => sortRuns(uniqueRuns(activeRunsQuery.data ?? [])),
    [activeRunsQuery.data]
  );
  const failedRuns = useMemo(
    () => sortRuns(uniqueRuns(failedRunsQuery.data ?? [])),
    [failedRunsQuery.data]
  );
  const recentRuns = useMemo(
    () => sortRuns(uniqueRuns(recentRunsQuery.data ?? [])),
    [recentRunsQuery.data]
  );
  const allRuns = useMemo(
    () => sortRuns(uniqueRuns([...activeRuns, ...failedRuns, ...recentRuns])),
    [activeRuns, failedRuns, recentRuns]
  );
  const openIncidents = useMemo(
    () => sortIncidents(incidentsQuery.data ?? []),
    [incidentsQuery.data]
  );

  const filteredActiveRuns = useMemo(
    () => filterRuns(activeRuns, runsSearchQuery),
    [activeRuns, runsSearchQuery]
  );
  const filteredFailedRuns = useMemo(
    () => filterRuns(failedRuns, runsSearchQuery),
    [failedRuns, runsSearchQuery]
  );
  const filteredRecentRuns = useMemo(
    () => filterRuns(recentRuns, runsSearchQuery),
    [recentRuns, runsSearchQuery]
  );
  const filteredAllRuns = useMemo(
    () => filterRuns(allRuns, runsSearchQuery),
    [allRuns, runsSearchQuery]
  );
  const succeededRuns = useMemo(
    () => filteredAllRuns.filter((run) => run.status === 'succeeded'),
    [filteredAllRuns]
  );
  const cancelledRuns = useMemo(
    () => filteredAllRuns.filter((run) => run.status === 'cancelled'),
    [filteredAllRuns]
  );
  const activeIds = useMemo(() => new Set(filteredActiveRuns.map((run) => run.id)), [filteredActiveRuns]);
  const failedIds = useMemo(() => new Set(filteredFailedRuns.map((run) => run.id)), [filteredFailedRuns]);
  const recentOnlyRuns = useMemo(
    () => filteredRecentRuns.filter((run) => !activeIds.has(run.id) && !failedIds.has(run.id)),
    [activeIds, failedIds, filteredRecentRuns]
  );
  const filteredSections = useMemo(() => {
    if (selectedFilter === 'all') {
      return [
        { key: 'active', title: 'Active runs', runs: filteredActiveRuns },
        { key: 'failed', title: 'Failed runs', runs: filteredFailedRuns },
        { key: 'recent', title: 'Recent runs', runs: recentOnlyRuns },
      ].filter((section) => section.runs.length > 0);
    }

    if (selectedFilter === 'active') {
      return [{ key: 'active', title: 'Active runs', runs: filteredActiveRuns }];
    }

    if (selectedFilter === 'failed') {
      return [{ key: 'failed', title: 'Failed runs', runs: filteredFailedRuns }];
    }

    if (selectedFilter === 'succeeded') {
      return [{ key: 'succeeded', title: 'Succeeded runs', runs: succeededRuns }];
    }

    return [{ key: 'cancelled', title: 'Cancelled runs', runs: cancelledRuns }];
  }, [
    cancelledRuns,
    filteredActiveRuns,
    filteredFailedRuns,
    recentOnlyRuns,
    selectedFilter,
    succeededRuns,
  ]);

  const isLoading =
    (activeRunsQuery.isLoading || failedRunsQuery.isLoading || recentRunsQuery.isLoading) &&
    allRuns.length === 0 &&
    openIncidents.length === 0;
  const hasError = Boolean(
    activeRunsQuery.error || failedRunsQuery.error || recentRunsQuery.error || incidentsQuery.error
  );
  const counts = useMemo(
    () => ({
      all: allRuns.length,
      active: activeRuns.length,
      failed: failedRuns.length,
      succeeded: allRuns.filter((run) => run.status === 'succeeded').length,
      cancelled: allRuns.filter((run) => run.status === 'cancelled').length,
    }),
    [activeRuns.length, allRuns, failedRuns.length]
  );
  const visibleRunsCount = filteredSections.reduce((total, section) => total + section.runs.length, 0);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    await Promise.allSettled([
      activeRunsQuery.refetch(),
      failedRunsQuery.refetch(),
      recentRunsQuery.refetch(),
      incidentsQuery.refetch(),
      safeInvalidateMany(queryClient, [{ queryKey: queryKeys.overview, label: 'overview' }]),
    ]);

    setIsRefreshing(false);
  }, [
    activeRunsQuery,
    failedRunsQuery,
    incidentsQuery,
    queryClient,
    recentRunsQuery,
  ]);

  const handleRetryRun = useCallback(
    (run: RunSummary) => {
      Alert.alert(
        'Retry failed run?',
        `Retry "${run.title}" on ${run.agentName || 'this agent'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Retry',
            onPress: () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              retryRunMutation.mutate(run.id, {
                onSuccess: async () => {
                  await safeInvalidateQueries(queryClient, queryKeys.incidents.all, 'incidents');
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                },
                onError: (error) => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                  Alert.alert('Retry failed', error instanceof Error ? error.message : 'Unable to retry this run.');
                },
              });
            },
          },
        ]
      );
    },
    [queryClient, retryRunMutation]
  );

  const handleRunPress = useCallback((run: RunSummary) => {
    if (run.agentId) {
      router.push(`/agent/${run.agentId}`);
    }
  }, [router]);

  const handleIncidentPress = useCallback((incident: Incident) => {
    if (incident.agentId) {
      router.push(`/agent/${incident.agentId}`);
    }
  }, [router]);

  const isRunRetrying = useCallback(
    (runId: string) => retryRunMutation.isPending && retryRunMutation.variables === runId,
    [retryRunMutation.isPending, retryRunMutation.variables]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.cyber}
            colors={[Colors.cyber]}
          />
        }
      >
        <View style={[styles.headerArea, { paddingTop: insets.top + 16 }]}>
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[Colors.heroGradientStart, Colors.heroGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.pageTitle}>Runs</Text>
            <Text style={styles.pageSubtitle}>
              Active, failed, and recent execution history with operator-safe recovery actions.
            </Text>

            <View style={styles.heroStats}>
              <StatPill
                icon={<Activity size={14} color={Colors.primary} />}
                label={`${counts.active} active`}
              />
              <StatPill
                icon={<AlertTriangle size={14} color={openIncidents.length > 0 ? Colors.error : Colors.warning} />}
                label={`${openIncidents.length} incidents`}
                tone={openIncidents.length > 0 ? 'critical' : 'default'}
              />
            </View>
          </View>

          <View style={styles.searchBar}>
            <Search size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search runs or agents..."
              placeholderTextColor={Colors.textMuted}
              value={runsSearchQuery}
              onChangeText={setRunsSearch}
              testID="runs-search"
            />
            {runsSearchQuery.length > 0 ? (
              <Pressable onPress={() => setRunsSearch('')} hitSlop={12}>
                <X size={16} color={Colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          {FILTER_OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              style={[
                styles.filterChip,
                selectedFilter === option.key && styles.filterChipActive,
              ]}
              onPress={() => {
                setRunsStatusFilter(option.key);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text
                style={[
                  styles.filterChipText,
                  selectedFilter === option.key && styles.filterChipTextActive,
                ]}
              >
                {option.label}
              </Text>
              <View
                style={[
                  styles.filterCount,
                  selectedFilter === option.key && styles.filterCountActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterCountText,
                    selectedFilter === option.key && styles.filterCountTextActive,
                  ]}
                >
                  {counts[option.key]}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.content}>
          {hasError ? (
            <View style={styles.errorBanner}>
              <View style={styles.errorBannerTextWrap}>
                <Text style={styles.errorBannerTitle}>Feed unavailable</Text>
                <Text style={styles.errorBannerText}>
                  Some runs or incidents could not be refreshed. Pull down to retry.
                </Text>
              </View>
              <Pressable style={styles.retryBannerButton} onPress={() => void handleRefresh()}>
                <Text style={styles.retryBannerText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {openIncidents.length > 0 ? (
            <View style={styles.section}>
              <SectionHeader title="Open incidents" count={openIncidents.length} />
              <View style={styles.sectionList}>
                {openIncidents.map((incident) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    onPress={incident.agentId ? () => handleIncidentPress(incident) : undefined}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeader
              title={selectedFilter === 'all' ? 'Runs feed' : `${getFilterLabel(selectedFilter)} runs`}
              count={visibleRunsCount}
            />

            {isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingTitle}>Loading runs</Text>
                <Text style={styles.loadingText}>Fetching the latest execution activity from OpenClaw.</Text>
              </View>
            ) : filteredSections.length > 0 ? (
              <View style={styles.sectionList}>
                {filteredSections.map((section) => (
                  <RunGroup
                    key={section.key}
                    section={section}
                    showTitle={selectedFilter === 'all'}
                    onRunPress={handleRunPress}
                    onRetry={handleRetryRun}
                    isRetrying={isRunRetrying}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                title={runsSearchQuery.trim().length > 0 ? 'No matching runs' : 'No runs available'}
                subtitle={
                  client
                    ? 'Try another search or filter, or pull to refresh.'
                    : 'Connect to a gateway to load runs and incidents.'
                }
              />
            )}
          </View>

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>

      <FloatingChatButton agents={agents} />
    </View>
  );
}

function StatPill({
  icon,
  label,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'default' | 'critical';
}) {
  return (
    <View
      style={[
        styles.statPill,
        tone === 'critical' && styles.statPillCritical,
      ]}
    >
      {icon}
      <Text style={styles.statPillText}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCount}>
        <Text style={styles.sectionCountText}>{count}</Text>
      </View>
    </View>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.emptyState}>
      <Activity size={40} color={Colors.textDim} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{subtitle}</Text>
    </View>
  );
}

function filterRuns(runs: RunSummary[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return runs;
  }

  return runs.filter((run) => {
    const haystack = [
      run.title,
      run.agentName,
      run.summary,
      run.errorMessage,
      resolveTriggerLabel(run),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function uniqueRuns(runs: RunSummary[]) {
  const byId = new Map<string, RunSummary>();

  for (const run of runs) {
    const current = byId.get(run.id);

    if (!current) {
      byId.set(run.id, run);
      continue;
    }

    byId.set(
      run.id,
      new Date(run.updatedAt).getTime() >= new Date(current.updatedAt).getTime() ? run : current
    );
  }

  return [...byId.values()];
}

function sortRuns(runs: RunSummary[]) {
  return [...runs].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function sortIncidents(incidents: Incident[]) {
  const severityRank = { critical: 0, warning: 1, info: 2 };
  return [...incidents].sort((left, right) => {
    const severityDiff = severityRank[left.severity] - severityRank[right.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function getFilterLabel(filter: FilterKey) {
  return FILTER_OPTIONS.find((option) => option.key === filter)?.label ?? 'Filtered';
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
    return trigger.toLowerCase();
  }

  if ((run.delegatedAgentNames?.length ?? 0) > 0) {
    return 'delegated';
  }

  if (run.conversationId) {
    return 'conversation';
  }

  return 'manual';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  headerArea: {
    paddingHorizontal: 20,
    gap: 14,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    padding: 20,
    gap: 10,
  },
  pageTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  pageSubtitle: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  statPillCritical: {
    borderColor: 'rgba(255, 85, 102, 0.18)',
    backgroundColor: Colors.errorGlow,
  },
  statPillText: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: Colors.text,
    fontSize: 16,
  },
  filterRow: {
    maxHeight: 56,
    marginTop: 14,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  filterChipActive: {
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primaryGlowStrong,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  filterCount: {
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: Colors.backgroundAlt,
  },
  filterCountActive: {
    backgroundColor: Colors.primaryGlowStrong,
  },
  filterCountText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterCountTextActive: {
    color: Colors.primary,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.errorGlow,
    borderWidth: 1,
    borderColor: 'rgba(255, 85, 102, 0.18)',
  },
  errorBannerTextWrap: {
    flex: 1,
    gap: 4,
  },
  errorBannerTitle: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '700',
  },
  errorBannerText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  retryBannerButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  retryBannerText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionCount: {
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionCountText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionList: {
    gap: 12,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  loadingTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  runGroup: {
    gap: 10,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  groupTitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  groupCount: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  runList: {
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 54,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomSpacer: {
    height: 110,
  },
});

function RunGroup({
  section,
  showTitle,
  onRunPress,
  onRetry,
  isRetrying,
}: {
  section: { key: string; title: string; runs: RunSummary[] };
  showTitle: boolean;
  onRunPress: (run: RunSummary) => void;
  onRetry: (run: RunSummary) => void;
  isRetrying: (runId: string) => boolean;
}) {
  return (
    <View style={styles.runGroup}>
      {showTitle ? (
        <View style={styles.groupHeader}>
          <Text style={styles.groupTitle}>{section.title}</Text>
          <Text style={styles.groupCount}>{section.runs.length}</Text>
        </View>
      ) : null}

      <View style={styles.runList}>
        {section.runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            onPress={() => onRunPress(run)}
            onRetry={onRetry}
            isRetrying={isRetrying(run.id)}
          />
        ))}
      </View>
    </View>
  );
}
