import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Bot, Send, Sparkles, User } from 'lucide-react-native';
import DelegationEvent from '@/components/DelegationEvent';
import ErrorStateCard from '@/components/ErrorStateCard';
import { ConversationSkeleton } from '@/components/SkeletonLoader';
import StatusDot from '@/components/StatusDot';
import ToolEvent from '@/components/ToolEvent';
import TypingIndicator from '@/components/TypingIndicator';
import Colors from '@/constants/colors';
import { getAgentColor, getStatusRingColor } from '@/constants/agentColors';
import { toConnectionErrorMessage } from '@/lib/openclaw/connection';
import { useAgentDetail } from '@/hooks/useAgentDetail';
import { useConversation, useSendMessage } from '@/hooks/useConversation';
import { createOpenClawEventsAdapter } from '@/lib/openclaw/events';
import { mapConversationMessage } from '@/lib/openclaw/mappers';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { useOpenClaw } from '@/providers/OpenClawProvider';
import type { Agent, ChatMessage, ConversationViewModel, EventPayload } from '@/types/openclaw';

const MESSAGE_SEND_RATE_LIMIT_MS = 500;

export default function AgentDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const agentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const { client, agents } = useOpenClaw();
  const agentDetailQuery = useAgentDetail(client, agentId);
  const conversationQuery = useConversation(client, agentId);
  const sendMessageMutation = useSendMessage(client);
  const lastMessageSentAtRef = useRef(0);
  const [streamingMessage, setStreamingMessage] = useState<ChatMessage | null>(null);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);

  const agent = agentDetailQuery.data?.agent ?? agents.find((candidate) => candidate.id === agentId);
  const conversationKey = useMemo(
    () => queryKeys.conversations.byAgent(agentId ?? ''),
    [agentId]
  );

  const updateConversationCache = useCallback(
    (updater: (current: ConversationViewModel) => ConversationViewModel) => {
      if (!agentId) {
        return;
      }

      queryClient.setQueryData<ConversationViewModel>(conversationKey, (current) =>
        updater(current ?? createEmptyConversation(agentId, agent))
      );
    },
    [agent, agentId, conversationKey, queryClient]
  );

  const handleRealtimeEvent = useCallback(
    (event: EventPayload) => {
      if (event.type === 'message.delta') {
        const payload = event.payload as { messageId?: unknown; delta?: unknown };
        const messageId = typeof payload.messageId === 'string' ? payload.messageId : null;
        const delta = typeof payload.delta === 'string' ? payload.delta : '';

        if (!messageId || !delta) {
          return;
        }

        setStreamingMessage((current) => {
          const base =
            current && current.id === messageId
              ? current
              : createStreamingAssistantMessage({
                  id: messageId,
                  agentId: agentId ?? event.agentId ?? agent?.id ?? '',
                  conversationId: event.conversationId ?? resolveConversationId(conversationQuery.data?.id) ?? null,
                  runId: event.runId ?? null,
                  timestamp: event.createdAt,
                });

          return {
            ...base,
            content: `${base.content}${delta}`,
            timestamp: event.createdAt,
            conversationId: event.conversationId ?? base.conversationId ?? null,
            runId: event.runId ?? base.runId ?? null,
            status: 'streaming',
          };
        });
        return;
      }

      if (event.type === 'message.completed') {
        const payload = event.payload as { message?: unknown };

        if (!payload.message || typeof payload.message !== 'object') {
          return;
        }

        const completedMessage = {
          ...mapConversationMessage(payload.message as Parameters<typeof mapConversationMessage>[0]),
          status: 'complete' as const,
        };

        setStreamingMessage((current) => (current?.id === completedMessage.id ? null : current));
        updateConversationCache((current) => ({
          ...current,
          id: completedMessage.conversationId ?? current.id,
          nextCursor: event.createdAt,
          messages: mergeMessages([...current.messages, completedMessage]),
        }));
        return;
      }

      const timelineEvent = toTimelineEventMessage(event, agentId ?? agent?.id ?? '');
      if (!timelineEvent) {
        if (event.type === 'run.updated' || event.type === 'incident.created' || event.type === 'agent.updated') {
          void conversationQuery.refetch();
          void agentDetailQuery.refetch();
        }
        return;
      }

      updateConversationCache((current) => {
        const events = mergeEvents([...current.events, event]);
        const messages = mergeMessages([...current.messages, timelineEvent]);

        return {
          ...current,
          nextCursor: event.createdAt,
          events,
          messages,
        };
      });
    },
    [
      agent?.id,
      agentDetailQuery,
      agentId,
      conversationQuery,
      updateConversationCache,
    ]
  );

  useEffect(() => {
    if (!agentId || !client || !isFocused) {
      return;
    }

    let subscriptionClosed = false;

    const adapter = createOpenClawEventsAdapter({
      client,
    });

    const subscription = adapter.subscribe({
      agentId,
      conversationId: resolveConversationId(conversationQuery.data?.id) ?? undefined,
      onEvent: (event) => {
        if (subscriptionClosed) {
          return;
        }

        handleRealtimeEvent(event);
      },
      onError: (error) => {
        if (subscriptionClosed) {
          return;
        }

        console.error('[AgentEvents] Subscription error:', toConnectionErrorMessage(error));
      },
    });

    return () => {
      subscriptionClosed = true;
      subscription.close();
    };
  }, [
    agentId,
    client,
    conversationQuery,
    handleRealtimeEvent,
    isFocused,
  ]);

  const conversation = conversationQuery.data;
  const timeline = useMemo(() => {
    const eventMessages = (conversation?.events ?? [])
      .map((event) => toTimelineEventMessage(event, agentId ?? agent?.id ?? ''))
      .filter((message): message is ChatMessage => Boolean(message));

    const allMessages = [
      ...(conversation?.messages ?? []),
      ...eventMessages,
      ...(streamingMessage ? [streamingMessage] : []),
    ];

    return mergeMessages(allMessages);
  }, [agent?.id, agentId, conversation?.events, conversation?.messages, streamingMessage]);

  const lastSubmittedTime = lastSubmittedAt ? new Date(lastSubmittedAt).getTime() : null;
  const hasReplySinceLastSend = useMemo(() => {
    if (!lastSubmittedTime) {
      return false;
    }

    return timeline.some((message) => {
      const timestamp = new Date(message.timestamp).getTime();
      return timestamp >= lastSubmittedTime && message.role !== 'user';
    });
  }, [lastSubmittedTime, timeline]);

  useEffect(() => {
    if (hasReplySinceLastSend) {
      setLastSubmittedAt(null);
    }
  }, [hasReplySinceLastSend]);

  useEffect(() => {
    if (!sendMessageMutation.isError) {
      return;
    }

    setLastSubmittedAt(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, [sendMessageMutation.isError]);

  const accentColor = useMemo(() => {
    if (!agent) {
      return { bg: Colors.primaryGlow, text: Colors.primary, border: 'rgba(61, 139, 255, 0.25)' };
    }

    return getAgentColor(agent.id);
  }, [agent]);
  const ringColor = useMemo(() => (agent ? getStatusRingColor(agent.status) : Colors.textMuted), [agent]);
  const statusLabel = agent
    ? agent.status === 'online'
      ? 'Online'
      : agent.status === 'busy'
        ? 'Busy'
        : agent.status === 'degraded'
          ? 'Degraded'
          : 'Offline'
    : 'Offline';

  const isAgentLoading = !agent && agentDetailQuery.isLoading;
  const isConversationLoading = conversationQuery.isLoading && !conversation;
  const showTypingIndicator =
    Boolean(lastSubmittedAt) &&
    !hasReplySinceLastSend &&
    !streamingMessage;

  if (!agentId) {
    return <NotFoundState router={router} title="Agent not found" subtitle="This agent route is invalid." />;
  }

  if (isAgentLoading) {
    return (
      <View style={styles.loadingScreen}>
        <Stack.Screen options={{ title: 'Loading...' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingTitle}>Loading agent</Text>
        <Text style={styles.loadingSubtitle}>Fetching operational details.</Text>
      </View>
    );
  }

  if (!agent) {
    return (
      <NotFoundState
        router={router}
        title="Agent not found"
        subtitle="This agent may have been removed or is unavailable."
      />
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: agent.name,
          headerStyle: { backgroundColor: Colors.background },
          headerTintColor: Colors.text,
          headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
          headerShadowVisible: false,
        }}
      />

      <View style={styles.agentHeader}>
        <View style={[styles.agentAvatar, { backgroundColor: accentColor.bg, borderColor: ringColor }]}>
          <Text style={[styles.avatarText, { color: accentColor.text }]}>
            {agent.avatar ?? agent.name[0]}
          </Text>
        </View>
        <View style={styles.agentMeta}>
          <Text style={styles.agentName}>{agent.name}</Text>
          <Text style={styles.agentModel}>{agent.model} · {agent.provider}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                agent.status === 'online'
                  ? Colors.successGlow
                  : agent.status === 'busy'
                    ? Colors.warningGlow
                    : agent.status === 'degraded'
                      ? Colors.errorGlow
                      : 'rgba(100, 100, 130, 0.12)',
            },
          ]}
        >
          <StatusDot status={agent.status} size={6} />
          <Text
            style={[
              styles.statusBadgeText,
              {
                color:
                  agent.status === 'online'
                    ? Colors.success
                    : agent.status === 'busy'
                      ? Colors.warning
                      : agent.status === 'degraded'
                        ? Colors.error
                        : Colors.textMuted,
              },
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <ChatView
        agent={agent}
        timeline={timeline}
        isConversationLoading={isConversationLoading}
        conversationError={conversationQuery.error instanceof Error ? conversationQuery.error.message : null}
        onRetryConversation={() => void conversationQuery.refetch()}
        onSend={(content) => {
          const trimmed = content.trim();
          if (!trimmed) {
            return false;
          }

          const now = Date.now();
          if (now - lastMessageSentAtRef.current < MESSAGE_SEND_RATE_LIMIT_MS) {
            console.warn('[Conversation] Message send throttled.');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            return false;
          }

          lastMessageSentAtRef.current = now;
          setLastSubmittedAt(new Date().toISOString());
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

          sendMessageMutation.mutate(
            {
              agentId,
              conversationId: resolveConversationId(conversation?.id) ?? agent.conversationId ?? undefined,
              content: trimmed,
            },
            {
              onError: () => {
                setLastSubmittedAt(null);
              },
            }
          );

          return true;
        }}
        isSending={sendMessageMutation.isPending}
        isWaitingForReply={showTypingIndicator}
        accentColor={accentColor}
      />
    </View>
  );
}

function ChatView({
  agent,
  timeline,
  isConversationLoading,
  conversationError,
  onRetryConversation,
  onSend,
  isSending,
  isWaitingForReply,
  accentColor,
}: {
  agent: Agent;
  timeline: ChatMessage[];
  isConversationLoading: boolean;
  conversationError: string | null;
  onRetryConversation: () => void;
  onSend: (content: string) => boolean;
  isSending: boolean;
  isWaitingForReply: boolean;
  accentColor: { bg: string; text: string; border: string };
}) {
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const { width: screenWidth } = useWindowDimensions();
  const maxBubbleWidth = useMemo(() => Math.min(screenWidth * 0.78, 340), [screenWidth]);
  const suggestedPrompts = useMemo(() => getSuggestedPrompts(agent), [agent]);

  const handleSubmit = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isSending) {
        return;
      }

      if (onSend(trimmed)) {
        setInput('');
      }
    },
    [isSending, onSend]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => clearTimeout(timer);
  }, [isWaitingForReply, timeline]);

  const renderTimelineItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      if (isDelegationMessage(item)) {
        return <DelegationEvent message={item} />;
      }

      if (isToolMessage(item)) {
        return <ToolEvent message={item} />;
      }

      if (item.role === 'system') {
        return (
          <View style={styles.systemMsg}>
            <AlertCircle size={14} color={Colors.warning} />
            <Text style={styles.systemMsgText}>{item.content}</Text>
          </View>
        );
      }

      const isUser = item.role === 'user';

      return (
        <View style={[styles.msgRow, isUser && styles.msgRowUser]}>
          {!isUser ? (
            <View style={[styles.msgAvatar, { backgroundColor: accentColor.bg }]}>
              <Bot size={14} color={accentColor.text} />
            </View>
          ) : null}
          <View
            style={[
              styles.msgBubble,
              isUser ? styles.userBubble : styles.aiBubble,
              { maxWidth: maxBubbleWidth },
            ]}
          >
            {isUser ? (
              <LinearGradient
                colors={[Colors.primary, Colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 20, borderBottomRightRadius: 6 }]}
              />
            ) : null}
            <Text style={[styles.msgText, isUser && styles.userMsgText]}>{item.content}</Text>
            <Text style={[styles.msgTime, isUser && styles.userMsgTime]}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          {isUser ? (
            <View style={styles.msgAvatarUser}>
              <User size={14} color={Colors.textSecondary} />
            </View>
          ) : null}
        </View>
      );
    },
    [accentColor, maxBubbleWidth]
  );

  return (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 160 : 0}
    >
      {isConversationLoading ? (
        <ConversationSkeleton style={styles.chatLoading} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={timeline}
          renderItem={renderTimelineItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chatList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.chatEmpty}>
              <View style={styles.chatEmptyIcon}>
                <Sparkles size={32} color={Colors.primary} />
              </View>
              <Text style={styles.chatEmptyTitle}>Chat with {agent.name}</Text>
              <Text style={styles.chatEmptyText}>Send a message or start with a coordinator prompt.</Text>
              <View style={styles.suggestionsWrap}>
                {suggestedPrompts.map((prompt) => (
                  <Pressable
                    key={prompt}
                    style={[styles.suggestionChip, isSending && styles.suggestionChipDisabled]}
                    onPress={() => handleSubmit(prompt)}
                    disabled={isSending}
                  >
                    <Text style={styles.suggestionText}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListHeaderComponent={
            conversationError ? (
              <ErrorStateCard
                style={styles.errorBanner}
                title="Conversation unavailable"
                message={conversationError}
                onRetry={onRetryConversation}
              />
            ) : null
          }
          ListFooterComponent={isWaitingForReply ? <TypingIndicator /> : <View style={styles.chatBottomSpace} />}
        />
      )}

      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatInput}
          placeholder={`Message ${agent.name}...`}
          placeholderTextColor={Colors.textMuted}
          value={input}
          onChangeText={setInput}
          multiline
          maxLength={4000}
          editable={!isSending}
          testID="chat-input"
        />
        <Pressable
          style={[
            styles.sendBtn,
            !input.trim() && !isSending && styles.sendBtnDisabled,
          ]}
          onPress={() => handleSubmit(input)}
          disabled={(!input.trim() && !isSending) || isSending}
        >
          {isSending ? (
            <LinearGradient
              colors={[Colors.primary, Colors.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sendBtnGradient}
            >
              <ActivityIndicator color="#000" size="small" />
            </LinearGradient>
          ) : input.trim() ? (
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

function NotFoundState({
  router,
  title,
  subtitle,
}: {
  router: ReturnType<typeof useRouter>;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.errorContainer}>
      <Stack.Screen options={{ title }} />
      <AlertCircle size={48} color={Colors.error} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorSubtext}>{subtitle}</Text>
      <Pressable style={styles.goBackBtn} onPress={() => router.back()}>
        <Text style={styles.goBackText}>Go Back</Text>
      </Pressable>
    </View>
  );
}

function createEmptyConversation(agentId: string, agent?: Agent): ConversationViewModel {
  return {
    id: agent?.conversationId ?? `pending:${agentId}`,
    agentId,
    agentName: agent?.name,
    messages: [],
    events: [],
    latestRun: agent?.lastRun ?? null,
    nextCursor: null,
  };
}

function createStreamingAssistantMessage({
  id,
  agentId,
  conversationId,
  runId,
  timestamp,
}: {
  id: string;
  agentId: string;
  conversationId?: string | null;
  runId?: string | null;
  timestamp: string;
}): ChatMessage {
  return {
    id,
    agentId,
    role: 'assistant',
    content: '',
    timestamp,
    conversationId: conversationId ?? null,
    runId: runId ?? null,
    status: 'streaming',
  };
}

function resolveConversationId(conversationId: string | null | undefined) {
  if (!conversationId || conversationId.startsWith('pending:')) {
    return null;
  }

  return conversationId;
}

function toTimelineEventMessage(event: EventPayload, fallbackAgentId: string): ChatMessage | null {
  if (event.type === 'delegation') {
    const payload = event.payload as {
      fromAgentId?: unknown;
      fromAgentName?: unknown;
      toAgentId?: unknown;
      toAgentName?: unknown;
      summary?: unknown;
    };

    return {
      id: `event:${event.id}`,
      agentId: event.agentId ?? fallbackAgentId,
      role: 'event',
      content: '',
      timestamp: event.createdAt,
      conversationId: event.conversationId ?? null,
      runId: event.runId ?? null,
      status: 'complete',
      metadata: {
        type: 'delegation',
        fromAgentId: typeof payload.fromAgentId === 'string' ? payload.fromAgentId : undefined,
        fromAgentName: typeof payload.fromAgentName === 'string' ? payload.fromAgentName : undefined,
        toAgentId: typeof payload.toAgentId === 'string' ? payload.toAgentId : undefined,
        toAgentName: typeof payload.toAgentName === 'string' ? payload.toAgentName : undefined,
        summary: typeof payload.summary === 'string' ? payload.summary : undefined,
      },
    };
  }

  if (event.type === 'tool.started' || event.type === 'tool.completed') {
    const payload = event.payload as { toolName?: unknown };

    return {
      id: `event:${event.id}`,
      agentId: event.agentId ?? fallbackAgentId,
      role: 'tool',
      content: '',
      timestamp: event.createdAt,
      conversationId: event.conversationId ?? null,
      runId: event.runId ?? null,
      status: event.type === 'tool.completed' ? 'complete' : 'streaming',
      metadata: {
        type: 'tool',
        phase: event.type === 'tool.completed' ? 'completed' : 'started',
        toolName: typeof payload.toolName === 'string' ? payload.toolName : 'tool',
      },
    };
  }

  return null;
}

function isDelegationMessage(message: ChatMessage) {
  return message.role === 'event' || message.metadata?.type === 'delegation';
}

function isToolMessage(message: ChatMessage) {
  return message.role === 'tool' || message.metadata?.type === 'tool';
}

function mergeMessages(messages: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();

  for (const message of messages) {
    const existing = byId.get(message.id);

    if (!existing) {
      byId.set(message.id, message);
      continue;
    }

    byId.set(message.id, preferRicherMessage(existing, message));
  }

  return [...byId.values()].sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime();
    const rightTime = new Date(right.timestamp).getTime();

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

function preferRicherMessage(current: ChatMessage, next: ChatMessage) {
  const currentScore = getMessageScore(current);
  const nextScore = getMessageScore(next);

  if (nextScore > currentScore) {
    return next;
  }

  if (nextScore < currentScore) {
    return current;
  }

  return {
    ...current,
    ...next,
    metadata: next.metadata ?? current.metadata,
  };
}

function getMessageScore(message: ChatMessage) {
  let score = message.content.length;

  if (message.status === 'complete') {
    score += 1_000;
  } else if (message.status === 'streaming') {
    score += 500;
  }

  if (message.metadata) {
    score += 100;
  }

  return score;
}

function mergeEvents(events: EventPayload[]) {
  const byId = new Map<string, EventPayload>();

  for (const event of events) {
    byId.set(event.id, event);
  }

  return [...byId.values()].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return leftTime - rightTime;
  });
}

function getSuggestedPrompts(agent: Agent) {
  if (agent.isCoordinator || agent.role === 'coordinator') {
    return [
      'Give me a quick system status summary.',
      'Which agents need operator attention right now?',
      'What did you delegate most recently?',
    ];
  }

  return [
    `Summarize ${agent.name}'s latest work.`,
    'What are you handling right now?',
    'Do you need operator intervention?',
  ];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
  },
  loadingTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  loadingSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
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
  chatContainer: {
    flex: 1,
  },
  liveState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginHorizontal: 20,
    marginBottom: 6,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  liveStateText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  chatLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 28,
  },
  chatLoadingTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  chatLoadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  chatList: {
    padding: 20,
    paddingBottom: 10,
    flexGrow: 1,
  },
  chatBottomSpace: {
    height: 14,
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
    textAlign: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
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
    fontWeight: '700' as const,
  },
  errorBannerText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surface,
  },
  retryBtnText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
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
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  suggestionChipDisabled: {
    opacity: 0.6,
  },
  suggestionText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
