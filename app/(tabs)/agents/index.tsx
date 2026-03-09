import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Modal, Pressable,
  Alert, RefreshControl, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search, ChevronRight, Plus, X, Cpu } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import { Agent, AgentStatus } from '@/types/openclaw';
import FloatingChatButton from '@/components/FloatingChatButton';
import { mockModels } from '@/mocks/models';
import { getAgentColor, getStatusRingColor } from '@/constants/agentColors';
import StatusDot from '@/components/StatusDot';
import PressableCard from '@/components/PressableCard';
import ChannelIcon from '@/components/ChannelIcon';

function AnimatedAgentCard({ agent, index, onPress }: { agent: Agent; index: number; onPress: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const accentColor = getAgentColor(agent.id);
  const ringColor = getStatusRingColor(agent.status);
  const statusLabel = agent.status === 'online' ? 'Online' : agent.status === 'busy' ? 'Busy' : 'Offline';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay: index * 70, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 14, bounciness: 4, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, index]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <PressableCard
        style={styles.agentCard}
        onPress={onPress}
        testID={`agent-list-${agent.id}`}
        glowColor={accentColor.border}
      >
        <View style={styles.agentTop}>
          <View style={[styles.agentAvatar, { backgroundColor: accentColor.bg, borderColor: ringColor }]}>
            <Text style={[styles.avatarText, { color: accentColor.text }]}>{agent.name[0]}</Text>
          </View>
          <View style={styles.agentMeta}>
            <Text style={styles.agentName}>{agent.name}</Text>
            <Text style={styles.agentDesc} numberOfLines={1}>{agent.description}</Text>
          </View>
          <ChevronRight size={18} color={Colors.textDim} />
        </View>

        <View style={styles.agentBottom}>
          <View style={styles.agentDetail}>
            <Text style={styles.detailLabel}>Model</Text>
            <Text style={styles.detailValue}>{agent.model}</Text>
          </View>
          <View style={styles.agentDetailDivider} />
          <View style={styles.agentDetail}>
            <Text style={styles.detailLabel}>Status</Text>
            <View style={styles.statusRow}>
              <StatusDot status={agent.status} size={6} />
              <Text style={[styles.detailValue, {
                color: agent.status === 'online' ? Colors.success
                  : agent.status === 'busy' ? Colors.warning
                  : Colors.textMuted,
              }]}>{statusLabel}</Text>
            </View>
          </View>
          <View style={styles.agentDetailDivider} />
          <View style={styles.agentDetail}>
            <Text style={styles.detailLabel}>Active</Text>
            <Text style={styles.detailValue}>{agent.lastActivity}</Text>
          </View>
        </View>

        {agent.channels.length > 0 && (
          <View style={styles.channelsRow}>
            {agent.channels.map((ch) => (
              <View key={ch.id} style={styles.channelChip}>
                <ChannelIcon type={ch.type} size={13} />
                <Text style={styles.channelLabel} numberOfLines={1}>{ch.label}</Text>
                <View style={[styles.connDot, { backgroundColor: ch.connected ? Colors.success : Colors.error }]} />
              </View>
            ))}
          </View>
        )}
      </PressableCard>
    </Animated.View>
  );
}

export default function AgentsScreen() {
  const { agents, addAgent, isRefreshing, refreshData } = useOpenClaw();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AgentStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const filteredAgents = useMemo(() => {
    return agents.filter(a => {
      const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.model.toLowerCase().includes(search.toLowerCase()) ||
        a.description.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [agents, search, statusFilter]);

  const filters: { key: AgentStatus | 'all'; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: agents.length },
    { key: 'online', label: 'Online', count: agents.filter(a => a.status === 'online').length },
    { key: 'busy', label: 'Busy', count: agents.filter(a => a.status === 'busy').length },
    { key: 'offline', label: 'Offline', count: agents.filter(a => a.status === 'offline').length },
  ];

  const handleAgentPress = useCallback((agentId: string) => {
    router.push(`/agent/${agentId}`);
  }, [router]);

  return (
    <View style={styles.container}>
      <View style={[styles.headerArea, { paddingTop: insets.top + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Agents</Text>
          <Pressable
            style={styles.createBtn}
            onPress={() => {
              setShowCreateModal(true);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          >
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.createBtnGradient}
            >
              <Plus size={20} color="#000" strokeWidth={3} />
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <Search size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search agents..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            testID="agent-search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={12}>
              <X size={16} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {filters.map((f) => (
          <Pressable
            key={f.key}
            style={[
              styles.filterChip,
              statusFilter === f.key && styles.filterChipActive,
            ]}
            onPress={() => {
              setStatusFilter(f.key);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[
              styles.filterChipText,
              statusFilter === f.key && styles.filterChipTextActive,
            ]}>
              {f.label}
            </Text>
            {f.count > 0 && (
              <View style={[styles.filterCount, statusFilter === f.key && styles.filterCountActive]}>
                <Text style={[styles.filterCountText, statusFilter === f.key && styles.filterCountTextActive]}>{f.count}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

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
        {filteredAgents.map((agent, index) => (
          <AnimatedAgentCard
            key={agent.id}
            agent={agent}
            index={index}
            onPress={() => handleAgentPress(agent.id)}
          />
        ))}
        {filteredAgents.length === 0 && (
          <View style={styles.emptyState}>
            <Search size={40} color={Colors.textDim} />
            <Text style={styles.emptyText}>No agents found</Text>
            <Text style={styles.emptySubtext}>Try a different search or filter</Text>
          </View>
        )}
        <View style={{ height: 110 }} />
      </ScrollView>

      <CreateAgentModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onAdd={addAgent}
      />

      <FloatingChatButton agents={agents} />
    </View>
  );
}

function CreateAgentModal({ visible, onClose, onAdd }: {
  visible: boolean;
  onClose: () => void;
  onAdd: (agent: Agent) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(mockModels[0].id);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showModels, setShowModels] = useState(false);

  const selectedModel = useMemo(() => {
    return mockModels.find(m => m.id === selectedModelId) ?? mockModels[0];
  }, [selectedModelId]);

  const handleCreate = useCallback(() => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please provide an agent name.');
      return;
    }
    const agent: Agent = {
      id: `agent-${Date.now()}`,
      name: name.trim(),
      status: 'offline',
      model: selectedModel.id,
      provider: selectedModel.provider,
      channels: [],
      lastActivity: 'Just created',
      description: description.trim() || `${name.trim()} agent`,
      systemPrompt: systemPrompt.trim() || `You are ${name.trim()}, a helpful AI assistant.`,
      agentDir: `~/.openclaw/agents/${name.trim().toLowerCase().replace(/\s+/g, '-')}`,
    };
    onAdd(agent);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setName('');
    setDescription('');
    setSelectedModelId(mockModels[0].id);
    setSystemPrompt('');
    setShowModels(false);
    onClose();
  }, [name, description, selectedModel, systemPrompt, onAdd, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Create Agent</Text>
          <Pressable style={styles.modalCloseBtn} onPress={onClose} hitSlop={12}>
            <X size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.formLabel}>Name</Text>
          <TextInput
            style={styles.formInput}
            placeholder="e.g. Navigator"
            placeholderTextColor={Colors.textMuted}
            value={name}
            onChangeText={setName}
          />

          <Text style={styles.formLabel}>Description</Text>
          <TextInput
            style={styles.formInput}
            placeholder="What does this agent do?"
            placeholderTextColor={Colors.textMuted}
            value={description}
            onChangeText={setDescription}
          />

          <Text style={styles.formLabel}>AI Model</Text>
          <Pressable
            style={styles.modelPickerBtn}
            onPress={() => setShowModels(!showModels)}
          >
            <View style={styles.modelPickerInfo}>
              <Cpu size={16} color={Colors.primary} />
              <View>
                <Text style={styles.modelPickerName}>{selectedModel.name}</Text>
                <Text style={styles.modelPickerProvider}>{selectedModel.provider}</Text>
              </View>
            </View>
            <Text style={styles.modelPickerChevron}>{showModels ? '▲' : '▼'}</Text>
          </Pressable>

          {showModels && (
            <View style={styles.modelListContainer}>
              {mockModels.map((model) => (
                <Pressable
                  key={model.id}
                  style={[
                    styles.modelOption,
                    selectedModelId === model.id && styles.modelOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedModelId(model.id);
                    setShowModels(false);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={styles.modelOptionName}>{model.name}</Text>
                  <Text style={styles.modelOptionDesc}>{model.provider} · {(model.contextWindow / 1000).toFixed(0)}K context</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.formLabel}>System Prompt</Text>
          <TextInput
            style={[styles.formInput, styles.formInputMultiline]}
            placeholder="Instructions for your agent..."
            placeholderTextColor={Colors.textMuted}
            value={systemPrompt}
            onChangeText={setSystemPrompt}
            multiline
            textAlignVertical="top"
          />

          <Pressable style={styles.modalSaveBtn} onPress={handleCreate}>
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalSaveBtnGradient}
            >
              <Text style={styles.modalSaveBtnText}>Create Agent</Text>
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
    marginBottom: 16,
  },
  pageTitle: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
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
  createBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    overflow: 'hidden',
  },
  createBtnGradient: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: {
    maxHeight: 56,
    marginTop: 12,
  },
  filterContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  filterChipText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  filterChipTextActive: {
    color: Colors.primary,
  },
  filterCount: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  filterCountActive: {
    backgroundColor: Colors.primaryGlowStrong,
  },
  filterCountText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  filterCountTextActive: {
    color: Colors.primary,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    paddingBottom: 32,
  },
  agentCard: {
    marginBottom: 12,
  },
  agentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  agentAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  agentMeta: {
    flex: 1,
  },
  agentName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  agentDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  agentBottom: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  agentDetail: {
    flex: 1,
  },
  agentDetailDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
    marginHorizontal: 10,
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600' as const,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  detailValue: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  channelsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  channelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  channelLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    maxWidth: 100,
  },
  connDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontWeight: '600' as const,
  },
  emptySubtext: {
    color: Colors.textMuted,
    fontSize: 14,
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
    minHeight: 120,
    textAlignVertical: 'top' as const,
  },
  modelPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  modelPickerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modelPickerName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  modelPickerProvider: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  modelPickerChevron: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  modelListContainer: {
    marginTop: 8,
    gap: 6,
  },
  modelOption: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  modelOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  modelOptionName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  modelOptionDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
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
});
