import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Switch, Pressable, Modal,
  TextInput, Alert, Animated, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Clock, Heart, Play, Pause, ChevronDown, ChevronUp, Terminal,
  Plus, Trash2, X, Search, Zap,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import { CronJob } from '@/types/openclaw';
import FloatingChatButton from '@/components/FloatingChatButton';
import StatusDot from '@/components/StatusDot';
import PressableCard from '@/components/PressableCard';

export default function SchedulerScreen() {
  const { agents, cronJobs, heartbeats, toggleCronJob, addCronJob, deleteCronJob, isRefreshing, refreshData } = useOpenClaw();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'cron' | 'heartbeat'>('cron');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const filteredCronJobs = useMemo(() => {
    if (!search.trim()) return cronJobs;
    const q = search.toLowerCase();
    return cronJobs.filter(j =>
      j.name.toLowerCase().includes(q) ||
      j.agentName.toLowerCase().includes(q) ||
      j.command.toLowerCase().includes(q)
    );
  }, [cronJobs, search]);

  const filteredHeartbeats = useMemo(() => {
    if (!search.trim()) return heartbeats;
    const q = search.toLowerCase();
    return heartbeats.filter(h =>
      h.targetName.toLowerCase().includes(q) ||
      h.targetType.toLowerCase().includes(q)
    );
  }, [heartbeats, search]);

  const handleToggleJob = useCallback((jobId: string) => {
    toggleCronJob(jobId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [toggleCronJob]);

  const handleExpandJob = useCallback((jobId: string) => {
    setExpandedJob(prev => prev === jobId ? null : jobId);
  }, []);

  const handleDeleteJob = useCallback((jobId: string, jobName: string) => {
    Alert.alert(
      'Delete Job',
      `Are you sure you want to delete "${jobName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCronJob(jobId);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ],
    );
  }, [deleteCronJob]);

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: insets.top + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Scheduler</Text>
          {activeTab === 'cron' && (
            <Pressable
              style={styles.addJobBtn}
              onPress={() => {
                setShowAddModal(true);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
            >
              <LinearGradient
                colors={[Colors.primary, Colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addJobBtnGradient}
              >
                <Plus size={16} color="#000" strokeWidth={3} />
                <Text style={styles.addJobBtnText}>New Job</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.tabRow}>
        {([
          { key: 'cron' as const, icon: Clock, label: 'Scheduled Jobs', count: cronJobs.length },
          { key: 'heartbeat' as const, icon: Heart, label: 'Health Monitor', count: heartbeats.length },
        ]).map(({ key, icon: Icon, label, count }) => (
          <Pressable
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => {
              setActiveTab(key);
              setSearch('');
              setShowSearch(false);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Icon size={16} color={activeTab === key ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {label}
            </Text>
            <View style={[styles.tabBadge, activeTab === key && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, activeTab === key && styles.tabBadgeTextActive]}>{count}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.actionBar}>
        {showSearch ? (
          <View style={styles.searchBar}>
            <Search size={16} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder={activeTab === 'cron' ? 'Search jobs...' : 'Search services...'}
              placeholderTextColor={Colors.textMuted}
              value={search}
              onChangeText={setSearch}
              autoFocus
              testID="scheduler-search"
            />
            <Pressable onPress={() => { setShowSearch(false); setSearch(''); }} hitSlop={12}>
              <X size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionBarContent}>
            <View style={styles.activeCountBadge}>
              <Zap size={13} color={activeTab === 'cron' ? Colors.success : Colors.primary} />
              <Text style={[styles.activeCountText, { color: activeTab === 'cron' ? Colors.success : Colors.primary }]}>
                {activeTab === 'cron'
                  ? `${cronJobs.filter(j => j.enabled).length} active`
                  : `${heartbeats.filter(h => h.status === 'healthy').length} healthy`
                }
              </Text>
            </View>
            <Pressable
              style={styles.searchToggleBtn}
              onPress={() => setShowSearch(true)}
              hitSlop={8}
            >
              <Search size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
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
        {activeTab === 'cron' && filteredCronJobs.map((job) => {
          const isExpanded = expandedJob === job.id;
          return (
            <PressableCard
              key={job.id}
              style={styles.jobCard}
              onPress={() => handleExpandJob(job.id)}
              glowColor={job.enabled ? 'rgba(34, 221, 136, 0.20)' : undefined}
            >
              <View style={styles.jobHeader}>
                <View style={styles.jobLeft}>
                  <View style={[styles.jobIcon, { backgroundColor: job.enabled ? Colors.successGlow : Colors.errorGlow }]}>
                    {job.enabled ? <Play size={14} color={Colors.success} /> : <Pause size={14} color={Colors.error} />}
                  </View>
                  <View style={styles.jobInfo}>
                    <Text style={styles.jobName}>{job.name}</Text>
                    <Text style={styles.jobAgent}>Agent: {job.agentName}</Text>
                  </View>
                </View>
                <View style={styles.jobRight}>
                  <Switch
                    value={job.enabled}
                    onValueChange={() => handleToggleJob(job.id)}
                    trackColor={{ false: Colors.surfaceLight, true: Colors.primaryGlowStrong }}
                    thumbColor={job.enabled ? Colors.primary : Colors.textMuted}
                  />
                  {isExpanded ? (
                    <ChevronUp size={16} color={Colors.textDim} />
                  ) : (
                    <ChevronDown size={16} color={Colors.textDim} />
                  )}
                </View>
              </View>

              {isExpanded && (
                <View style={styles.jobExpanded}>
                  <Text style={styles.jobDesc}>{job.description}</Text>

                  <View style={styles.jobMetaGrid}>
                    <View style={styles.jobMetaItem}>
                      <Text style={styles.metaLabel}>Schedule</Text>
                      <Text style={styles.metaValueMono}>{job.expression}</Text>
                    </View>
                    <View style={styles.jobMetaItem}>
                      <Text style={styles.metaLabel}>Last Run</Text>
                      <Text style={styles.metaValue}>
                        {job.lastRun ? new Date(job.lastRun).toLocaleDateString() : 'Never'}
                      </Text>
                    </View>
                    <View style={styles.jobMetaItem}>
                      <Text style={styles.metaLabel}>Next Run</Text>
                      <Text style={styles.metaValue}>
                        {new Date(job.nextRun).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.commandBox}>
                    <Terminal size={14} color={Colors.primary} />
                    <Text style={styles.commandText}>{job.command}</Text>
                  </View>

                  <Pressable
                    style={styles.deleteJobBtn}
                    onPress={() => handleDeleteJob(job.id, job.name)}
                  >
                    <Trash2 size={14} color={Colors.error} />
                    <Text style={styles.deleteJobText}>Delete Job</Text>
                  </Pressable>
                </View>
              )}
            </PressableCard>
          );
        })}

        {activeTab === 'cron' && filteredCronJobs.length === 0 && (
          <View style={styles.emptyState}>
            <Clock size={40} color={Colors.textDim} />
            <Text style={styles.emptyText}>
              {search.trim() ? 'No jobs found' : 'No scheduled jobs yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {search.trim() ? 'Try a different search' : 'Tap "New Job" to create one'}
            </Text>
          </View>
        )}

        {activeTab === 'heartbeat' && (
          <>
            <View style={styles.heartbeatSummary}>
              {[
                { label: 'Healthy', count: heartbeats.filter(h => h.status === 'healthy').length, color: Colors.success, glow: Colors.successGlow },
                { label: 'Degraded', count: heartbeats.filter(h => h.status === 'degraded').length, color: Colors.warning, glow: Colors.warningGlow },
                { label: 'Down', count: heartbeats.filter(h => h.status === 'down').length, color: Colors.error, glow: Colors.errorGlow },
              ].map(({ label, count, color, glow }) => (
                <View key={label} style={styles.hbStat}>
                  <LinearGradient
                    colors={[glow, 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
                  />
                  <Text style={[styles.hbStatNum, { color }]}>{count}</Text>
                  <Text style={styles.hbStatLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {filteredHeartbeats.map((hb) => (
              <HeartbeatRow key={hb.id} hb={hb} />
            ))}

            {filteredHeartbeats.length === 0 && search.trim() && (
              <View style={styles.emptyState}>
                <Heart size={40} color={Colors.textDim} />
                <Text style={styles.emptyText}>No services found</Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>

      <AddJobModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addCronJob}
        agents={agents.map(a => ({ id: a.id, name: a.name }))}
      />

      <FloatingChatButton agents={agents} />
    </View>
  );
}

function HeartbeatRow({ hb }: { hb: import('@/types/openclaw').HeartbeatEntry }) {
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: Math.min(Math.max(hb.uptimePercent, 0), 100),
      duration: 900,
      useNativeDriver: false,
    }).start();
  }, [barAnim, hb.uptimePercent]);

  const barColor =
    hb.status === 'healthy' ? Colors.success :
    hb.status === 'degraded' ? Colors.warning : Colors.error;

  const barGradientEnd =
    hb.status === 'healthy' ? Colors.accent :
    hb.status === 'degraded' ? '#FF8C00' : '#FF3333';

  const barWidth = barAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const statusLabel = hb.status === 'healthy' ? 'Healthy' : hb.status === 'degraded' ? 'Degraded' : 'Down';

  return (
    <View style={styles.hbCard}>
      <View style={styles.hbTop}>
        <StatusDot status={hb.status} size={8} />
        <View style={styles.hbInfo}>
          <Text style={styles.hbName}>{hb.targetName}</Text>
          <Text style={styles.hbType}>{hb.targetType} · {statusLabel}</Text>
        </View>
        <View style={styles.hbStats}>
          <Text style={[styles.hbLatency, { color: barColor }]}>
            {hb.status === 'down' ? 'Offline' : `${hb.latencyMs}ms`}
          </Text>
          <Text style={styles.hbUptime}>{hb.uptimePercent.toFixed(1)}% uptime</Text>
        </View>
      </View>
      <View style={styles.hbBar}>
        <Animated.View style={[styles.hbBarFill, { width: barWidth }]}>
          <LinearGradient
            colors={[barColor, barGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

function AddJobModal({ visible, onClose, onAdd, agents }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (job: CronJob) => void;
  agents: { id: string; name: string }[];
}) {
  const [name, setName] = useState('');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [command, setCommand] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? '');
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const handleAdd = useCallback(() => {
    if (!name.trim() || !expression.trim() || !command.trim()) {
      Alert.alert('Missing Fields', 'Please fill in the name, schedule, and command.');
      return;
    }
    const selectedAgent = agents.find(a => a.id === selectedAgentId) ?? agents[0];
    const job: CronJob = {
      id: `cron-${Date.now()}`,
      name: name.trim(),
      expression: expression.trim(),
      agentId: selectedAgent?.id ?? 'agent-001',
      agentName: selectedAgent?.name ?? 'Atlas',
      enabled: true,
      lastRun: null,
      nextRun: new Date(Date.now() + 86400000).toISOString(),
      description: description.trim() || 'Scheduled task',
      command: command.trim(),
    };
    onAdd(job);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setName('');
    setExpression('');
    setDescription('');
    setCommand('');
    setSelectedAgentId(agents[0]?.id ?? '');
    setShowAgentPicker(false);
    onClose();
  }, [name, expression, description, command, selectedAgentId, agents, onAdd, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>New Scheduled Job</Text>
          <Pressable style={styles.modalCloseBtn} onPress={onClose} hitSlop={12}>
            <X size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.formLabel}>Job Name</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. Nightly Backup"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.formLabel}>Schedule (Cron)</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. 0 2 * * * (every day at 2 AM)"
            placeholderTextColor={Colors.textMuted}
            value={expression}
            onChangeText={setExpression}
            autoCapitalize="none"
          />

          <Text style={styles.formLabel}>Assign to Agent</Text>
          <Pressable
            style={styles.agentPickerBtn}
            onPress={() => setShowAgentPicker(!showAgentPicker)}
          >
            <Text style={styles.agentPickerText}>
              {agents.find(a => a.id === selectedAgentId)?.name ?? 'Choose agent'}
            </Text>
            <ChevronDown size={16} color={Colors.textMuted} />
          </Pressable>

          {showAgentPicker && (
            <View style={styles.agentListContainer}>
              {agents.map((agent) => (
                <Pressable
                  key={agent.id}
                  style={[
                    styles.agentOption,
                    selectedAgentId === agent.id && styles.agentOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedAgentId(agent.id);
                    setShowAgentPicker(false);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={styles.agentOptionName}>{agent.name}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.formLabel}>Command</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. backup --full --compress"
            placeholderTextColor={Colors.textMuted}
            value={command}
            onChangeText={setCommand}
            autoCapitalize="none"
          />

          <Text style={styles.formLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.formInput, styles.formInputMultiline]}
            placeholder="What does this job do?"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={styles.modalSaveBtn} onPress={handleAdd}>
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalSaveBtnGradient}
            >
              <Text style={styles.modalSaveBtnText}>Create Job</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pageTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 11,
  },
  tabActive: {
    backgroundColor: Colors.primaryGlow,
  },
  tabText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  tabBadge: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  tabBadgeActive: {
    backgroundColor: Colors.primaryGlowStrong,
  },
  tabBadgeText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  tabBadgeTextActive: {
    color: Colors.primary,
  },
  actionBar: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
  },
  actionBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.successGlow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  activeCountText: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  searchToggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 14,
    gap: 10,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    height: 44,
    padding: 0,
  },
  addJobBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  addJobBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addJobBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingBottom: 32,
  },
  jobCard: {
    marginBottom: 10,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  jobLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  jobIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobInfo: {
    flex: 1,
  },
  jobName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  jobAgent: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  jobRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jobExpanded: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  jobDesc: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  jobMetaGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  jobMetaItem: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 12,
  },
  metaLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  metaValue: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  metaValueMono: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  commandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    padding: 14,
    marginBottom: 16,
  },
  commandText: {
    color: Colors.primary,
    fontSize: 13,
    flex: 1,
    fontWeight: '500' as const,
  },
  deleteJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.errorGlow,
  },
  deleteJobText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 17,
    fontWeight: '600' as const,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  heartbeatSummary: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  hbStat: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 18,
    alignItems: 'center',
    overflow: 'hidden',
  },
  hbStatNum: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  hbStatLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500' as const,
    marginTop: 4,
  },
  hbCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 10,
  },
  hbTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  hbInfo: {
    flex: 1,
  },
  hbName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  hbType: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize' as const,
  },
  hbStats: {
    alignItems: 'flex-end',
  },
  hbLatency: {
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  hbUptime: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  hbBar: {
    height: 4,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  hbBarFill: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.4,
  },
  modalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 20,
    paddingBottom: 40,
  },
  formLabel: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
    marginBottom: 8,
    marginTop: 20,
  },
  formInput: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  formInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top' as const,
  },
  modalSaveBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 32,
  },
  modalSaveBtnGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    borderRadius: 16,
  },
  modalSaveBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '800' as const,
  },
  agentPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
  },
  agentPickerText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  agentListContainer: {
    marginTop: 8,
    gap: 6,
  },
  agentOption: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  agentOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  agentOptionName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
