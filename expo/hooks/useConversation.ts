import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenClawClient, OpenClawClientError } from '@/lib/openclaw/client';
import { mapConversation, mapConversationMessage } from '@/lib/openclaw/mappers';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { safeInvalidateQueries } from '@/lib/openclaw/queryUtils';
import type { ChatMessage, ConversationViewModel } from '@/types/openclaw';

const CONVERSATION_QUERY_GC_TIME = 10 * 60 * 1000;
const MAX_MESSAGE_CONTENT_LENGTH = 4_000;

export function useConversation(client: OpenClawClient | null, agentId: string | undefined) {
  const queryClient = useQueryClient();
  const conversationKey = queryKeys.conversations.byAgent(agentId ?? '');
  const initialConversation =
    agentId && client?.hasSnapshot() ? client.peekConversation({ agentId }) : null;

  useEffect(() => {
    if (!client || !agentId) {
      return;
    }

    const syncConversation = () => {
      const raw = client.peekConversation({ agentId });

      if (!raw) {
        return;
      }

      const nextConversation = mapConversation(raw);
      queryClient.setQueryData<ConversationViewModel>(conversationKey, (current) => ({
        ...nextConversation,
        events: current?.events ?? nextConversation.events,
        messages: mergeMessages([...(current?.messages ?? []), ...nextConversation.messages]),
        latestRun: nextConversation.latestRun ?? current?.latestRun ?? null,
        nextCursor: nextConversation.nextCursor ?? current?.nextCursor ?? null,
      }));
    };

    syncConversation();

    const unsubscribePush = client.subscribeToPushEvents((event) => {
      if (event.event === 'chat' || event.event === 'agent' || event.event === 'presence') {
        syncConversation();
      }
    });
    const unsubscribeConnection = client.subscribeToConnectionState((state) => {
      if (state === 'connected') {
        syncConversation();
      }
    });

    return () => {
      unsubscribePush();
      unsubscribeConnection();
    };
  }, [agentId, client, conversationKey, queryClient]);

  return useQuery({
    queryKey: conversationKey,
    queryFn: async () => {
      if (!client || !agentId) throw new Error('No client or agent id');

      try {
        const raw = await client.getConversation({ agentId });
        const nextConversation = mapConversation(raw);
        const current = queryClient.getQueryData<ConversationViewModel>(conversationKey);

        return current
          ? {
              ...nextConversation,
              events: current.events,
              messages: mergeMessages([...current.messages, ...nextConversation.messages]),
              latestRun: nextConversation.latestRun ?? current.latestRun ?? null,
              nextCursor: nextConversation.nextCursor ?? current.nextCursor ?? null,
            }
          : nextConversation;
      } catch (error) {
        if (
          error instanceof OpenClawClientError &&
          (error.status === 404 || error.code === 'SESSION_KEY_REQUIRED')
        ) {
          return {
            id: `pending:${agentId}`,
            agentId,
            messages: [],
            events: [],
            latestRun: null,
            nextCursor: null,
          } satisfies ConversationViewModel;
        }

        throw error;
      }
    },
    initialData: initialConversation ? mapConversation(initialConversation) : undefined,
    enabled: !!client && !!agentId,
    gcTime: CONVERSATION_QUERY_GC_TIME,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useSendMessage(client: OpenClawClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      agentId,
      conversationId,
      content,
      metadata,
    }: {
      agentId: string;
      conversationId?: string | null;
      content: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!client) throw new Error('No client');
      const normalizedContent = normalizeOutgoingMessageContent(content);
      return client.sendMessage({
        agentId,
        conversationId: conversationId ?? undefined,
        content: normalizedContent,
        metadata,
      });
    },
    onMutate: async (variables) => {
      const normalizedContent = normalizeOutgoingMessageContent(variables.content);
      const conversationKey = queryKeys.conversations.byAgent(variables.agentId);
      const mutationId = createMutationId();
      const optimisticTimestamp = new Date().toISOString();

      variables.content = normalizedContent;
      await queryClient.cancelQueries({ queryKey: conversationKey });

      const optimisticMessage: ChatMessage = {
        id: `optimistic:${mutationId}`,
        agentId: variables.agentId,
        role: 'user',
        content: normalizedContent,
        timestamp: optimisticTimestamp,
        conversationId:
          variables.conversationId ??
          queryClient.getQueryData<ConversationViewModel>(conversationKey)?.id ??
          null,
        status: 'pending',
        metadata: variables.metadata,
      };

      queryClient.setQueryData<ConversationViewModel>(conversationKey, (current) => ({
        id: current?.id ?? variables.conversationId ?? `pending:${variables.agentId}`,
        agentId: variables.agentId,
        agentName: current?.agentName,
        events: current?.events ?? [],
        latestRun: current?.latestRun ?? null,
        nextCursor: current?.nextCursor ?? null,
        messages: mergeMessages([...(current?.messages ?? []), optimisticMessage]),
      }));

      return {
        agentId: variables.agentId,
        mutationId,
        optimisticMessageId: optimisticMessage.id,
      };
    },
    onError: (_error, variables, context) => {
      const conversationKey = queryKeys.conversations.byAgent(variables.agentId);

      queryClient.setQueryData<ConversationViewModel>(conversationKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          messages: current.messages.filter((message) => message.id !== context?.optimisticMessageId),
        };
      });
    },
    onSuccess: (data, variables, context) => {
      const conversationKey = queryKeys.conversations.byAgent(variables.agentId);
      const confirmedMessage = {
        ...mapConversationMessage(data.message),
        status: 'complete' as const,
      };

      queryClient.setQueryData<ConversationViewModel>(conversationKey, (current) => {
        const messages = (current?.messages ?? []).filter(
          (message) => message.id !== context?.optimisticMessageId
        );

        return {
          id: data.conversationId,
          agentId: variables.agentId,
          agentName: current?.agentName,
          events: current?.events ?? [],
          latestRun: current?.latestRun ?? null,
          nextCursor: current?.nextCursor ?? null,
          messages: mergeMessages([...messages, confirmedMessage]),
        };
      });
    },
    onSettled: async (_data, _error, variables) => {
      await safeInvalidateQueries(
        queryClient,
        queryKeys.conversations.byAgent(variables.agentId),
        `conversation:${variables.agentId}`
      );
    },
  });
}

function createMutationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeOutgoingMessageContent(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error('Enter a message before sending.');
  }

  if (trimmed.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new Error(`Messages must be ${MAX_MESSAGE_CONTENT_LENGTH} characters or fewer.`);
  }

  return trimmed;
}

function mergeMessages(messages: ChatMessage[]) {
  const byId = new Map<string, ChatMessage>();

  for (const message of messages) {
    const existing = byId.get(message.id);

    if (!existing) {
      byId.set(message.id, message);
      continue;
    }

    byId.set(message.id, selectPreferredMessage(existing, message));
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

function selectPreferredMessage(current: ChatMessage, next: ChatMessage) {
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
