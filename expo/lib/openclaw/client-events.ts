import type { ConnectionState } from '@/types/openclaw';
import type {
  OpenClawConnectionListener,
  OpenClawPushEventListener,
  OpenClawPushEventMessage,
} from '@/lib/openclaw/client-types';
import { OpenClawClientError } from '@/lib/openclaw/client-types';
import type { OpenClawClientDataStore } from '@/lib/openclaw/client-data';
import {
  collectNormalizedIncidents,
  collectNormalizedRuns,
  createAssistantMessage,
  extractSessionKey,
  mapChatStateToRunStatus,
  normalizeAgentPayload,
  normalizeConversationMessage,
  normalizeIncidentPayload,
  normalizeNodePayload,
  normalizeRunPayload,
  normalizeSessionPayload,
} from '@/lib/openclaw/client-data';
import { asRecord, createId, firstString, getArray } from '@/lib/openclaw/client-utils';

export interface OpenClawClientEventsConfig {
  data: OpenClawClientDataStore;
  getConnectionState: () => ConnectionState;
  getConnectionError: () => OpenClawClientError | null;
}

export class OpenClawClientEvents {
  private readonly pushListeners = new Set<OpenClawPushEventListener>();
  private readonly connectionListeners = new Set<OpenClawConnectionListener>();

  constructor(private readonly config: OpenClawClientEventsConfig) {}

  subscribeToConnectionState(listener: OpenClawConnectionListener) {
    this.connectionListeners.add(listener);
    listener(this.config.getConnectionState(), this.config.getConnectionError());

    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  subscribeToPushEvents(listener: OpenClawPushEventListener) {
    this.pushListeners.add(listener);

    return () => {
      this.pushListeners.delete(listener);
    };
  }

  notifyConnectionState(state: ConnectionState, error: OpenClawClientError | null) {
    this.connectionListeners.forEach((listener) => {
      listener(state, error);
    });
  }

  emitPushEvent(event: OpenClawPushEventMessage) {
    this.pushListeners.forEach((listener) => {
      listener(event);
    });
  }

  applyPushEvent(event: OpenClawPushEventMessage) {
    switch (event.event) {
      case 'presence':
        this.applyPresencePayload(event.payload);
        break;
      case 'agent':
        this.applyAgentPayload(event.payload);
        break;
      case 'chat':
        this.applyChatPayload(event.payload);
        break;
      case 'cron':
        this.applyCronPayload(event.payload);
        break;
      default:
        break;
    }

    this.config.data.syncOverviewCollections();
  }

  private applyPresencePayload(payload: unknown) {
    const root = asRecord(payload);
    const entries = getArray(root?.presence) ?? (Array.isArray(payload) ? payload : [payload]);

    for (const entry of entries) {
      const record = asRecord(entry);
      const node = normalizeNodePayload(record);

      if (node) {
        this.config.data.upsertNode(node);
      }
    }
  }

  private applyAgentPayload(payload: unknown) {
    const root = asRecord(asRecord(payload)?.agent) ?? asRecord(payload);
    const agentId = firstString(root?.id, root?.agentId);
    const existing = agentId ? this.config.data.buildAgentSnapshot(agentId) : undefined;
    const agent = normalizeAgentPayload(root, existing ?? undefined);

    if (agent) {
      this.config.data.upsertAgent(agent);
    }

    const run = normalizeRunPayload(root?.currentRun ?? root?.run ?? root?.latestRun, {
      agentId: agent?.id ?? existing?.id ?? '',
      conversationId: agent?.conversationId ?? existing?.conversationId ?? null,
    });

    if (run) {
      this.config.data.upsertRun(run);
    }

    const incident = normalizeIncidentPayload(root?.incident ?? root?.latestIncident);
    if (incident) {
      this.config.data.upsertIncident(incident);
    }
  }

  private applyChatPayload(payload: unknown) {
    const root = asRecord(payload);
    const sessionKey = extractSessionKey(root);

    if (!sessionKey) {
      return;
    }

    const agentId =
      firstString(root?.agentId) ??
      this.config.data.getAgentIdForConversation(sessionKey) ??
      '';
    const conversation =
      this.config.data.peekConversation({ conversationId: sessionKey }) ?? null;

    const state = firstString(root?.state, root?.phase) ?? 'final';
    const messageRoot = asRecord(root?.message);
    const createdAt = firstString(root?.createdAt, messageRoot?.createdAt) ?? new Date().toISOString();

    this.config.data.upsertSession(
      normalizeSessionPayload(root, {
        agentId,
        agentName: agentId ? this.config.data.buildAgentSnapshot(agentId)?.name : undefined,
        status: mapChatStateToRunStatus(state),
        createdAt,
        updatedAt: createdAt,
        sessionKey,
      })
    );

    if (state === 'delta') {
      const messageId =
        firstString(messageRoot?.id, messageRoot?.messageId, root?.messageId) ??
        `stream:${sessionKey}:${firstString(root?.runId) ?? 'run'}`;
      const delta =
        firstString(messageRoot?.delta, root?.delta, messageRoot?.content) ??
        (typeof root?.message === 'string' ? root.message : '');

      const currentMessage =
        conversation?.messages.find((message) => message.id === messageId) ??
        createAssistantMessage({
          id: messageId,
          agentId,
          conversationId: sessionKey,
          runId: firstString(root?.runId) ?? null,
          content: '',
          status: 'streaming',
        });

      this.config.data.upsertConversationMessage(sessionKey, {
        ...currentMessage,
        content: `${currentMessage.content}${delta}`,
        createdAt,
        runId: firstString(messageRoot?.runId, root?.runId) ?? currentMessage.runId ?? null,
        status: 'streaming',
      });
    } else if (state === 'final') {
      const message = normalizeConversationMessage(
        messageRoot ?? root,
        agentId,
        sessionKey,
        'assistant'
      );

      if (message) {
        this.config.data.upsertConversationMessage(sessionKey, {
          ...message,
          status: 'complete',
        });
      }
    } else if (state === 'error' || state === 'aborted') {
      const errorMessage = firstString(root?.errorMessage, root?.message, root?.reason);

      this.config.data.upsertConversationMessage(
        sessionKey,
        normalizeConversationMessage(
          {
            id: `system:${sessionKey}:${firstString(root?.runId) ?? createId()}`,
            agentId,
            role: 'system',
            content: errorMessage ?? (state === 'aborted' ? 'Run aborted.' : 'Run failed.'),
            createdAt: firstString(root?.createdAt) ?? new Date().toISOString(),
            conversationId: sessionKey,
            runId: firstString(root?.runId) ?? null,
            status: 'failed',
          },
          agentId,
          sessionKey
        )
      );
    }

    const run = normalizeRunPayload(root?.run ?? root, {
      agentId,
      conversationId: sessionKey,
      title: 'Chat response',
      summary:
        state === 'error'
          ? 'Run failed.'
          : state === 'aborted'
            ? 'Run aborted.'
            : state === 'final'
              ? 'Run completed.'
              : 'Run in progress.',
      status: mapChatStateToRunStatus(state),
      createdAt,
    });

    if (run) {
      this.config.data.upsertRun(run);
    }
  }

  private applyCronPayload(payload: unknown) {
    const root = asRecord(payload);
    const runs = [
      ...collectNormalizedRuns(root?.run),
      ...collectNormalizedRuns(root?.runs),
      ...collectNormalizedRuns(root?.latestRun),
    ];
    const incidents = [
      ...collectNormalizedIncidents(root?.incident),
      ...collectNormalizedIncidents(root?.incidents),
    ];

    runs.forEach((run) => this.config.data.upsertRun(run));
    incidents.forEach((incident) => this.config.data.upsertIncident(incident));
  }
}
