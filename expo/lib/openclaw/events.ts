import {
  OpenClawClient,
  OpenClawClientError,
  type OpenClawPushEventMessage,
} from '@/lib/openclaw/client';
import type {
  ConnectionState,
  EventPayload,
  GatewayConversationMessageResponse,
} from '@/types/openclaw';

export interface OpenClawEventsAdapterConfig {
  client: OpenClawClient;
}

export interface SubscribeToEventsOptions {
  conversationId?: string;
  agentId?: string;
  cursor?: string;
  limit?: number;
  onEvent: (event: EventPayload) => void;
  onError?: (error: OpenClawClientError) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
  onFallbackStateChange?: (isUsingPollingFallback: boolean) => void;
}

export interface OpenClawEventSubscription {
  close: () => void;
}

export class OpenClawEventsAdapter {
  constructor(private readonly config: OpenClawEventsAdapterConfig) {}

  subscribe(options: SubscribeToEventsOptions): OpenClawEventSubscription {
    options.onFallbackStateChange?.(false);

    const unsubscribeConnection = this.config.client.subscribeToConnectionState((state, error) => {
      options.onConnectionStateChange?.(state);

      if (error) {
        options.onError?.(error);
      }
    });

    const unsubscribePush = this.config.client.subscribeToPushEvents((rawEvent) => {
      const mapped = mapPushEventToPayloads(rawEvent, this.config.client, options);
      mapped.forEach((event) => options.onEvent(event));
    });

    void this.config.client.connect().catch((error) => {
      options.onError?.(normalizeEventError(error));
    });

    return {
      close: () => {
        unsubscribePush();
        unsubscribeConnection();
        options.onFallbackStateChange?.(false);
      },
    };
  }
}

export function createOpenClawEventsAdapter(config: OpenClawEventsAdapterConfig) {
  return new OpenClawEventsAdapter(config);
}

function mapPushEventToPayloads(
  rawEvent: OpenClawPushEventMessage,
  client: OpenClawClient,
  options: Pick<SubscribeToEventsOptions, 'agentId' | 'conversationId'>
): EventPayload[] {
  switch (rawEvent.event) {
    case 'chat':
      return mapChatPushEvent(rawEvent, client, options);
    case 'presence':
      return mapPresencePushEvent(rawEvent, client, options);
    case 'agent':
      return mapAgentPushEvent(rawEvent, client, options);
    case 'cron':
      return mapCronPushEvent(rawEvent, client, options);
    default:
      return [];
  }
}

function mapChatPushEvent(
  rawEvent: OpenClawPushEventMessage,
  client: OpenClawClient,
  options: Pick<SubscribeToEventsOptions, 'agentId' | 'conversationId'>
): EventPayload[] {
  const payload = asRecord(rawEvent.payload);
  const conversationId = extractSessionKey(payload);
  const agentId =
    firstString(payload?.agentId) ??
    (conversationId ? client.getAgentIdForConversation(conversationId) : null) ??
    null;

  if (!matchesScope(options, { agentId, conversationId: conversationId ?? null })) {
    return [];
  }

  const createdAt =
    firstString(payload?.createdAt, asRecord(payload?.message)?.createdAt) ?? new Date().toISOString();
  const runId = firstString(payload?.runId) ?? null;
  const state = firstString(payload?.state, payload?.phase) ?? 'final';
  const messagePayload = asRecord(payload?.message);
  const messageId =
    firstString(messagePayload?.id, messagePayload?.messageId, payload?.messageId) ??
    `chat:${rawEvent.seq ?? createdAt}`;
  const conversation = conversationId
    ? client.peekConversation({ conversationId })
    : null;

  if (state === 'delta') {
    const delta =
      firstString(messagePayload?.delta, payload?.delta, messagePayload?.content) ??
      (typeof payload?.message === 'string' ? payload.message : '');

    if (!delta) {
      return [];
    }

    return [
      {
        id: toEventId(rawEvent, messageId, state),
        type: 'message.delta',
        createdAt,
        agentId,
        conversationId: conversationId ?? null,
        runId,
        payload: {
          messageId,
          delta,
        },
      } satisfies EventPayload,
    ];
  }

  if (state === 'final') {
    const message =
      selectConversationMessage(conversation?.messages ?? [], messageId) ??
      normalizeCompletedMessage(messagePayload ?? payload, {
        agentId: agentId ?? '',
        conversationId: conversationId ?? null,
        runId,
      });

    if (!message) {
      return [];
    }

    return [
      {
        id: toEventId(rawEvent, message.id, state),
        type: 'message.completed',
        createdAt,
        agentId: message.agentId,
        conversationId: message.conversationId ?? conversationId ?? null,
        runId: message.runId ?? runId,
        payload: {
          message,
        },
      } satisfies EventPayload,
    ];
  }

  return [
    {
      id: toEventId(rawEvent, messageId, state),
      type: `message.${state}`,
      createdAt,
      agentId,
      conversationId: conversationId ?? null,
      runId,
      payload: payload ?? {},
    } satisfies EventPayload,
  ];
}

function mapPresencePushEvent(
  rawEvent: OpenClawPushEventMessage,
  client: OpenClawClient,
  options: Pick<SubscribeToEventsOptions, 'agentId' | 'conversationId'>
): EventPayload[] {
  const payload = asRecord(rawEvent.payload);
  const entries = getArray(payload?.presence) ?? (Array.isArray(rawEvent.payload) ? rawEvent.payload : [rawEvent.payload]);

  return entries.flatMap((entry, index) => {
    const record = asRecord(asRecord(entry)?.agent) ?? asRecord(entry);
    const agentId = firstString(record?.id, record?.agentId);
    const agent = agentId ? client.peekAgent(agentId) : null;
    const conversationId = agent?.conversationId ?? extractSessionKey(record) ?? null;

    if (!agent || !matchesScope(options, { agentId: agent.id, conversationId })) {
      return [];
    }

    return [
      {
        id: toEventId(rawEvent, agent.id, `presence:${index}`),
        type: 'agent.updated',
        createdAt:
          firstString(record?.updatedAt, record?.lastSeenAt, record?.timestamp) ?? new Date().toISOString(),
        agentId: agent.id,
        conversationId,
        runId: agent.currentRun?.id ?? null,
        payload: {
          agent,
        },
      } satisfies EventPayload,
    ];
  });
}

function mapAgentPushEvent(
  rawEvent: OpenClawPushEventMessage,
  client: OpenClawClient,
  options: Pick<SubscribeToEventsOptions, 'agentId' | 'conversationId'>
): EventPayload[] {
  const payload = asRecord(asRecord(rawEvent.payload)?.agent) ?? asRecord(rawEvent.payload);
  const agentId = firstString(payload?.id, payload?.agentId);
  const agent = agentId ? client.peekAgent(agentId) : null;
  const conversationId = agent?.conversationId ?? extractSessionKey(payload) ?? null;

  if (!agent || !matchesScope(options, { agentId: agent.id, conversationId })) {
    return [];
  }

  return [
    {
      id: toEventId(rawEvent, agent.id, 'agent'),
      type: 'agent.updated',
      createdAt:
        firstString(payload?.updatedAt, payload?.timestamp, payload?.lastActivityAt) ??
        new Date().toISOString(),
      agentId: agent.id,
      conversationId,
      runId: agent.currentRun?.id ?? null,
      payload: {
        agent,
      },
    } satisfies EventPayload,
  ];
}

function mapCronPushEvent(
  rawEvent: OpenClawPushEventMessage,
  client: OpenClawClient,
  options: Pick<SubscribeToEventsOptions, 'agentId' | 'conversationId'>
): EventPayload[] {
  const payload = asRecord(rawEvent.payload);
  const runIds = collectIds(payload?.run, payload?.latestRun, payload?.runs);
  const incidentIds = collectIds(payload?.incident, payload?.incidents);
  const runEvents: EventPayload[] = client
    .peekRuns()
    .items.filter((run) => runIds.size === 0 || runIds.has(run.id))
    .filter((run) =>
      matchesScope(options, {
        agentId: run.agentId,
        conversationId: run.conversationId ?? null,
      })
    )
    .map((run) => ({
      id: toEventId(rawEvent, run.id, 'run'),
      type: 'run.updated',
      createdAt: run.updatedAt ?? run.createdAt,
      agentId: run.agentId,
      conversationId: run.conversationId ?? null,
      runId: run.id,
      payload: {
        run,
      }
    }));
  const incidentEvents: EventPayload[] = client
    .peekIncidents()
    .items.filter((incident) => incidentIds.size === 0 || incidentIds.has(incident.id))
    .filter((incident) =>
      matchesScope(options, {
        agentId: incident.agentId ?? null,
        conversationId: incident.conversationId ?? null,
      })
    )
    .map((incident) => ({
      id: toEventId(rawEvent, incident.id, 'incident'),
      type: 'incident.created',
      createdAt: incident.updatedAt ?? incident.createdAt,
      agentId: incident.agentId ?? null,
      conversationId: incident.conversationId ?? null,
      runId: incident.runId ?? null,
      payload: {
        incident,
      }
    }));

  return [...runEvents, ...incidentEvents];
}

function normalizeCompletedMessage(
  value: Record<string, unknown> | null,
  fallback: {
    agentId: string;
    conversationId: string | null;
    runId: string | null;
  }
): GatewayConversationMessageResponse | null {
  if (!value) {
    return null;
  }

  const content = firstString(value.content, value.text, value.delta);
  if (!content) {
    return null;
  }

  return {
    id: firstString(value.id, value.messageId) ?? `message:${Date.now()}`,
    agentId: firstString(value.agentId) ?? fallback.agentId,
    role: normalizeMessageRole(firstString(value.role) ?? 'assistant'),
    content,
    createdAt: firstString(value.createdAt, value.timestamp) ?? new Date().toISOString(),
    conversationId:
      firstString(value.conversationId, value.sessionKey) ?? fallback.conversationId,
    runId: firstString(value.runId) ?? fallback.runId,
    status: 'complete',
    metadata: {
      ...value,
    },
  };
}

function selectConversationMessage(
  messages: GatewayConversationMessageResponse[],
  messageId: string
) {
  return (
    messages.find((message) => message.id === messageId) ??
    [...messages].reverse().find((message) => message.role === 'assistant') ??
    null
  );
}

function matchesScope(
  options: Pick<SubscribeToEventsOptions, 'agentId' | 'conversationId'>,
  scope: {
    agentId: string | null;
    conversationId: string | null;
  }
) {
  if (options.agentId && scope.agentId !== options.agentId) {
    return false;
  }

  if (options.conversationId && scope.conversationId !== options.conversationId) {
    return false;
  }

  return true;
}

function collectIds(...values: unknown[]) {
  const ids = new Set<string>();

  values.forEach((value) => {
    const items = getArray(value);

    if (items) {
      items.forEach((entry) => {
        const record = asRecord(entry);
        const id = firstString(record?.id, record?.runId, record?.incidentId);
        if (id) {
          ids.add(id);
        }
      });
      return;
    }

    const record = asRecord(value);
    const id = firstString(record?.id, record?.runId, record?.incidentId);
    if (id) {
      ids.add(id);
    }
  });

  return ids;
}

function toEventId(rawEvent: OpenClawPushEventMessage, suffix: string, kind: string) {
  return `${rawEvent.event}:${rawEvent.seq ?? 'na'}:${kind}:${suffix}`;
}

function normalizeEventError(error: unknown) {
  if (error instanceof OpenClawClientError) {
    return error;
  }

  if (error instanceof Error) {
    return new OpenClawClientError(error.message, {
      code: error.name,
    });
  }

  return new OpenClawClientError('Unknown event subscription failure.');
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function extractSessionKey(record: Record<string, unknown> | null | undefined) {
  return firstString(
    record?.sessionKey,
    record?.conversationId,
    record?.conversationKey,
    record?.threadId,
    asRecord(record?.session)?.key
  );
}

function normalizeMessageRole(value: string) {
  switch (value) {
    case 'user':
    case 'assistant':
    case 'system':
    case 'tool':
    case 'event':
      return value;
    default:
      return 'assistant';
  }
}
