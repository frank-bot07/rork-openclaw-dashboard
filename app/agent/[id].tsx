import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, FlatList, Alert, useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  MessageSquare, Settings2, Radio, Send, Bot, User, AlertCircle,
  Cpu, FileText, FolderOpen, ChevronDown, Trash2, Eraser, Sparkles,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import { mockModels } from '@/mocks/models';
import { getAgentColor, getStatusRingColor } from '@/constants/agentColors';
import StatusDot from '@/components/StatusDot';
import ChannelIcon from '@/components/ChannelIcon';
import TypingIndicator from '@/components/TypingIndicator';
import { ChatMessage, AIModel, Agent, ChannelBinding } from '@/types/openclaw';
import { mockQuickActions } from '@/mocks/activity';

type DetailTab = 'chat' | 'config' | 'channels';

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { agents, chatMessages, sendMessage, updateAgent, deleteAgent, clearChat, isTyping, quickActions } = useOpenClaw();
  const agent = agents.find(a => a.id === id);
  const [activeTab, setActiveTab] = useState<DetailTab>('chat');

  const messages = useMemo(() => {
    if (!agent) return [];
    return chatMessages[agent.id] || [];
  }, [agent, chatMessages]);

  const agentIsTyping = useMemo(() => {
    if (!agent) return false;
    return isTyping[agent.id] ?? false;
  }, [agent, isTyping]);

  const accentColor = useMemo(() => {
    if (!agent) return { bg: Colors.primaryGlow, text: Colors.primary, border: 'rgba(61, 139, 255, 0.25)' };
    return getAgentColor(agent.id);
  }, [agent]);

  const ringColor = useMemo(() => {
    if (!agent) return Colors.textMuted;
    return getStatusRingColor(agent.status);
  }, [agent]);

  const handleDeleteAgent = useCallback(() => {
    if (!agent) return;
    Alert.alert(
      'Delete Agent',
      `This will permanently delete "${agent.name}" and all chat history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAgent(agent.id);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          },
        },
      ],
    );
  }, [agent, deleteAgent, router]);

  const handleClearChat = useCallback(() => {
    if (!agent) return;
    Alert.alert(
      'Clear Chat',
      `Remove all messages with "${agent.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearChat(agent.id);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  }, [agent, clearChat]);

  if (!agent) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Not Found' }} />
        <AlertCircle size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>Agent not found</Text>
        <Text style={styles.errorSubtext}>This agent may have been deleted</Text>
        <Pressable style={styles.goBackBtn} onPress={() => router.back()}>
          <Text style={styles.goBackText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const statusLabel = agent.status === 'online' ? 'Online' : agent.status === 'busy' ? 'Busy' : 'Offline';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: agent.name,
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              onPress={handleDeleteAgent}
              style={styles.headerDeleteBtn}
              hitSlop={12}
            >
              <Trash2 size={18} color={Colors.error} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.agentHeader}>
        <View style={[styles.agentAvatar, { backgroundColor: accentColor.bg, borderColor: ringColor }]}>
          <Text style={[styles.avatarText, { color: accentColor.text }]}>{agent.name[0]}</Text>
        </View>
        <View style={styles.agentMeta}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentModel}>{agent.model} · {agent.provider}</Text>
        </View>
        <View style={[styles.statusBadge, {
          backgroundColor: agent.status === 'online' ? Colors.successGlow
            : agent.status === 'busy' ? Colors.warningGlow
            : 'rgba(100, 100, 130, 0.12)',
        }]}>
          <StatusDot status={agent.status} size={6} />
          <Text style={[styles.statusBadgeText, {
            color: agent.status === 'online' ? Colors.success
              : agent.status === 'busy' ? Colors.warning
              : Colors.textMuted,
          }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        {([
          { key: 'chat' as const, icon: MessageSquare, label: 'Chat' },
          { key: 'config' as const, icon: Settings2, label: 'Config' },
          { key: 'channels' as const, icon: Radio, label: 'Channels' },
        ]).map(({ key, icon: Icon, label }) => (
          <Pressable
            key={key}
            style={[styles.tabBtn, activeTab === key && styles.tabBtnActive]}
            onPress={() => {
              setActiveTab(key);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Icon size={16} color={activeTab === key ? Colors.primary : Colors.textMuted} />
            <Text style={[styles.tabBtnText, activeTab === key && styles.tabBtnTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'chat' && (
        <ChatView
          agentId={agent.id}
          agentName={agent.name}
          messages={messages}
          onSend={sendMessage}
          onClearChat={handleClearChat}
          isTyping={agentIsTyping}
          agentQuickActions={quickActions.filter(qa => qa.agentId === agent.id)}
          accentColor={accentColor}
        />
      )}
      {activeTab === 'config' && (
        <ConfigView agent={agent} onUpdate={updateAgent} />
      )}
      {activeTab === 'channels' && (
        <ChannelsView channels={agent.channels} />
      )}
    </View>
  );
}

function ChatView({ agentId, agentName, messages, onSend, onClearChat, isTyping: typing, agentQuickActions, accentColor }: {
  agentId: string;
  agentName: string;
  messages: ChatMessage[];
  onSend: (agentId: string, content: string) => void;
  onClearChat: () => void;
  isTyping: boolean;
  agentQuickActions: typeof mockQuickActions;
  accentColor: { bg: string; text: string; border: string };
}) {
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const { width: screenWidth } = useWindowDimensions();
  const maxBubbleWidth = useMemo(() => Math.min(screenWidth * 0.78, 340), [screenWidth]);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(agentId, input.trim());
    setInput('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [input, agentId, onSend]);

  useEffect(() => {
    if (messages.length > 0) {
      const timer = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length, typing]);

  const renderMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const isSystem = item.role === 'system';

    if (isSystem) {
      return (
        <View style={styles.systemMsg}>
          <AlertCircle size={14} color={Colors.warning} />
          <Text style={styles.systemMsgText}>{item.content}</Text>
        </View>
      );
    }

    return (
      <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
        {!isUser && (
          <View style={[styles.msgAvatar, { backgroundColor: accentColor.bg }]}>
            <Bot size={14} color={accentColor.text} />
          </View>
        )}
        <View style={[
          styles.msgBubble,
          isUser ? styles.userBubble : styles.aiBubble,
          { maxWidth: maxBubbleWidth },
        ]}>
          {isUser && (
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 20, borderBottomRightRadius: 6 }]}
            />
          )}
          <Text style={[styles.msgText, isUser && styles.userMsgText]}>{item.content}</Text>
          <Text style={[styles.msgTime, isUser && styles.userMsgTime]}>
            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {isUser && (
          <View style={styles.msgAvatarUser}>
            <User size={14} color={Colors.textSecondary} />
          </View>
        )}
      </View>
    );
  }, [maxBubbleWidth, accentColor]);

  return (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 160 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.chatList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.chatEmpty}>
            <View style={styles.chatEmptyIcon}>
              <Sparkles size={32} color={Colors.primary} />
            </View>
            <Text style={styles.chatEmptyTitle}>Chat with {agentName}</Text>
            <Text style={styles.chatEmptyText}>Send a message or try a suggestion below</Text>
            {agentQuickActions.length > 0 && (
              <View style={styles.suggestionsWrap}>
                {agentQuickActions.map((qa) => (
                  <Pressable
                    key={qa.id}
                    style={styles.suggestionChip}
                    onPress={() => {
                      onSend(agentId, qa.command);
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Text style={styles.suggestionText}>{qa.label}</Text>
                    <Text style={styles.suggestionDesc} numberOfLines={1}>{qa.description}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        }
        ListHeaderComponent={
          messages.length > 0 ? (
            <Pressable style={styles.clearChatBtn} onPress={onClearChat} hitSlop={8}>
              <Eraser size={14} color={Colors.textDim} />
              <Text style={styles.clearChatText}>Clear chat</Text>
            </Pressable>
          ) : null
        }
        ListFooterComponent={typing ? <TypingIndicator /> : null}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatInput}
          placeholder={`Message ${agentName}...`}
          placeholderTextColor={Colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={4000}
          testID="chat-input"
        />
        <Pressable
          style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          {input.trim() ? (
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtnGradient}
            >
              <Send size={18} color="#000" />
            </LinearGradient>
          ) : (
            <Send size={18} color={Colors.textDim} />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ConfigView({ agent, onUpdate }: {
  agent: Agent;
  onUpdate: (agentId: string, updates: Partial<Agent>) => void;
}) {
  const [prompt, setPrompt] = useState(agent.systemPrompt);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [selectedModel, setSelectedModel] = useState(agent.model);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSavePrompt = useCallback(() => {
    onUpdate(agent.id, { systemPrompt: prompt });
    setHasChanges(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [agent.id, prompt, onUpdate]);

  const handleSelectModel = useCallback((model: AIModel) => {
    setSelectedModel(model.id);
    onUpdate(agent.id, { model: model.id, provider: model.provider });
    setShowModelPicker(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [agent.id, onUpdate]);

  const handlePromptChange = useCallback((text: string) => {
    setPrompt(text);
    setHasChanges(text !== agent.systemPrompt);
  }, [agent.systemPrompt]);

  return (
    <ScrollView style={styles.configContainer} contentContainerStyle={styles.configContent} showsVerticalScrollIndicator={false}>
      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <Cpu size={16} color={Colors.primary} />
          <Text style={styles.configSectionTitle}>AI Model</Text>
        </View>
        <Pressable
          style={styles.modelSelector}
          onPress={() => setShowModelPicker(!showModelPicker)}
        >
          <Text style={styles.modelSelectedText}>{selectedModel}</Text>
          <ChevronDown size={16} color={Colors.textMuted} />
        </Pressable>

        {showModelPicker && (
          <View style={styles.modelList}>
            {mockModels.map((model) => (
              <Pressable
                key={model.id}
                style={[
                  styles.modelOption,
                  selectedModel === model.id && styles.modelOptionActive,
                ]}
                onPress={() => handleSelectModel(model)}
              >
                <View style={styles.modelOptionTop}>
                  <Text style={styles.modelOptionName}>{model.name}</Text>
                  <Text style={styles.modelOptionProvider}>{model.provider}</Text>
                </View>
                <Text style={styles.modelOptionDesc}>{model.description}</Text>
                <View style={styles.modelCaps}>
                  {model.capabilities.slice(0, 3).map((cap) => (
                    <View key={cap} style={styles.capBadge}>
                      <Text style={styles.capText}>{cap}</Text>
                    </View>
                  ))}
                  <Text style={styles.modelCtx}>
                    {(model.contextWindow / 1000).toFixed(0)}K context
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <FileText size={16} color="#7C5CE7" />
          <Text style={styles.configSectionTitle}>System Prompt</Text>
        </View>
        <TextInput
          style={styles.promptInput}
          multiline
          value={prompt}
          onChangeText={handlePromptChange}
          placeholder="Enter instructions for this agent..."
          placeholderTextColor={Colors.textMuted}
          textAlignVertical="top"
          testID="config-prompt"
        />
        <Pressable
          style={[styles.savePromptBtn, !hasChanges && styles.savePromptBtnDisabled]}
          onPress={handleSavePrompt}
          disabled={!hasChanges}
        >
          {hasChanges ? (
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.savePromptGradient}
            >
              <Text style={styles.savePromptText}>Save Changes</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.savePromptTextDisabled}>No Changes</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.configSection}>
        <View style={styles.configSectionHeader}>
          <FolderOpen size={16} color={Colors.accent} />
          <Text style={styles.configSectionTitle}>Workspace</Text>
        </View>
        <View style={styles.workspaceCard}>
          <Text style={styles.workspaceLabel}>Agent Directory</Text>
          <Text style={styles.workspacePath}>{agent.agentDir}</Text>
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ChannelsView({ channels }: { channels: ChannelBinding[] }) {
  if (channels.length === 0) {
    return (
      <View style={styles.channelsEmpty}>
        <Radio size={44} color={Colors.textDim} />
        <Text style={styles.channelsEmptyText}>No channels connected</Text>
        <Text style={styles.channelsEmptySubtext}>
          Connect messaging channels through the OpenClaw CLI
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.channelsContainer} contentContainerStyle={styles.channelsContent} showsVerticalScrollIndicator={false}>
      {channels.map((ch) => (
        <View key={ch.id} style={styles.channelCard}>
          <View style={styles.channelCardTop}>
            <ChannelIcon type={ch.type} size={18} />
            <View style={styles.channelInfo}>
              <Text style={styles.channelCardLabel}>{ch.label}</Text>
              <Text style={styles.channelType}>{ch.type}</Text>
            </View>
            <View style={[
              styles.connBadge,
              { backgroundColor: ch.connected ? Colors.successGlow : Colors.errorGlow },
              { borderColor: ch.connected ? 'rgba(34, 221, 136, 0.15)' : 'rgba(255, 85, 102, 0.15)' },
            ]}>
              <View style={[
                styles.connBadgeDot,
                { backgroundColor: ch.connected ? Colors.success : Colors.error },
              ]} />
              <Text style={[
                styles.connBadgeText,
                { color: ch.connected ? Colors.success : Colors.error },
              ]}>
                {ch.connected ? 'Connected' : 'Disconnected'}
              </Text>
            </View>
          </View>
          <View style={styles.channelIdentifier}>
            <Text style={styles.identifierLabel}>Identifier</Text>
            <Text style={styles.identifierValue}>{ch.identifier}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '700' as const,
    marginTop: 8,
  },
  errorSubtext: {
    color: Colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  goBackBtn: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primaryGlow,
  },
  goBackText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  headerDeleteBtn: {
    padding: 8,
  },
  agentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 14,
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
    fontSize: 22,
    fontWeight: '800' as const,
  },
  agentMeta: {
    flex: 1,
  },
  agentName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800' as const,
    letterSpacing: -0.4,
  },
  agentModel: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 3,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 4,
    marginBottom: 6,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 11,
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryGlow,
  },
  tabBtnText: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  tabBtnTextActive: {
    color: Colors.primary,
  },
  chatContainer: {
    flex: 1,
  },
  chatList: {
    padding: 20,
    paddingBottom: 10,
    flexGrow: 1,
  },
  chatEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
    gap: 8,
  },
  chatEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: 'rgba(77, 154, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  chatEmptyTitle: {
    color: Colors.text,
    fontSize: 19,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  chatEmptyText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  clearChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 10,
  },
  clearChatText: {
    color: Colors.textDim,
    fontSize: 13,
  },
  systemMsg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warningGlow,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  systemMsgText: {
    color: Colors.warning,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 14,
    gap: 8,
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgAvatarUser: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgBubble: {
    borderRadius: 20,
    padding: 14,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  userBubble: {
    borderBottomRightRadius: 6,
  },
  aiBubble: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderBottomLeftRadius: 6,
  },
  msgText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  userMsgText: {
    color: '#000',
    fontWeight: '500' as const,
  },
  msgTime: {
    color: Colors.textDim,
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end' as const,
  },
  userMsgTime: {
    color: 'rgba(0,0,0,0.35)',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 14,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    gap: 10,
  },
  chatInput: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    color: Colors.text,
    fontSize: 15,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sendBtnDisabled: {
    backgroundColor: Colors.surfaceLight,
  },
  sendBtnGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  configContainer: {
    flex: 1,
  },
  configContent: {
    padding: 20,
    paddingBottom: 32,
  },
  configSection: {
    marginBottom: 28,
  },
  configSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  configSectionTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  modelSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
  },
  modelSelectedText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  modelList: {
    marginTop: 10,
    gap: 8,
  },
  modelOption: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
  },
  modelOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGlow,
  },
  modelOptionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modelOptionName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  modelOptionProvider: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  modelOptionDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  modelCaps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  capBadge: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  capText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  modelCtx: {
    color: Colors.textDim,
    fontSize: 11,
    marginLeft: 4,
  },
  promptInput: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.text,
    fontSize: 14,
    padding: 16,
    minHeight: 150,
    lineHeight: 22,
  },
  savePromptBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 12,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    paddingVertical: 14,
  },
  savePromptBtnDisabled: {},
  savePromptGradient: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
  },
  savePromptText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700' as const,
  },
  savePromptTextDisabled: {
    color: Colors.textDim,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  workspaceCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
  },
  workspaceLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 6,
  },
  workspacePath: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  channelsContainer: {
    flex: 1,
  },
  channelsContent: {
    padding: 20,
    paddingBottom: 32,
  },
  channelsEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 40,
  },
  channelsEmptyText: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '600' as const,
  },
  channelsEmptySubtext: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  channelCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 10,
  },
  channelCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  channelInfo: {
    flex: 1,
  },
  channelCardLabel: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  channelType: {
    color: Colors.textMuted,
    fontSize: 12,
    textTransform: 'capitalize' as const,
    marginTop: 2,
  },
  connBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  connBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  channelIdentifier: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  identifierLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  identifierValue: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  suggestionsWrap: {
    marginTop: 24,
    width: '100%',
    paddingHorizontal: 8,
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  suggestionText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: 3,
  },
  suggestionDesc: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
