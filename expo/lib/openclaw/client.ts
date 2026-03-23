import { openClawAuth } from '@/lib/openclaw/auth';
import { OpenClawClientDataStore, createEmptyConversationResponse, normalizeConversationHistory, normalizeRunPayload } from '@/lib/openclaw/client-data';
import { OpenClawClientEvents } from '@/lib/openclaw/client-events';
import { OpenClawClientRpc } from '@/lib/openclaw/client-rpc';
import {
  DEFAULT_RECONNECT_CONFIG,
  DEFAULT_TIMEOUT_MS,
  OpenClawClientError,
  type OpenClawClientConfig,
  type OpenClawClientRuntimeState,
  type OpenClawConnectionListener,
  type OpenClawPushEventListener,
  type RequestOptions,
} from '@/lib/openclaw/client-types';
import { createId, isAuthError, normalizeBaseUrl, normalizeError } from '@/lib/openclaw/client-utils';
import { OpenClawClientWebSocket } from '@/lib/openclaw/client-websocket';
import type {
  AgentQuery,
  GatewayAgentDetailResponse,
  GatewayConversationMessageResponse,
  GatewayMessageSendResponse,
  IncidentsQuery,
  RunsQuery,
  SendMessageInput,
  ConversationQuery,
} from '@/types/openclaw';

export { OpenClawClientError } from './client-types';
export type {
  OpenClawClientConfig,
  OpenClawConnectionListener,
  OpenClawPushEventListener,
  OpenClawPushEventMessage,
  OpenClawReconnectConfig,
  OpenClawRpcResponseMessage,
} from './client-types';

export class OpenClawClient {
  private readonly state: OpenClawClientRuntimeState;
  private readonly data: OpenClawClientDataStore;
  private readonly events: OpenClawClientEvents;
  private readonly rpc: OpenClawClientRpc;
  private readonly websocket: OpenClawClientWebSocket;

  constructor(config: OpenClawClientConfig) {
    this.state = {
      config: {
        ...config,
        baseUrl: normalizeBaseUrl(config.baseUrl),
      },
      reconnectConfig: {
        ...DEFAULT_RECONNECT_CONFIG,
        ...config.reconnect,
      },
      socket: null,
      connectPromise: null,
      connectPromiseResolve: null,
      connectPromiseReject: null,
      handshakeRequestId: null,
      handshakeTimeoutId: null,
      reconnectTimeoutId: null,
      lastConnectionError: null,
      connectionState: 'disconnected',
      instanceId: createId(),
      reconnectAttempt: 0,
      hasConnectedAtLeastOnce: false,
      manuallyClosed: false,
    };

    this.data = new OpenClawClientDataStore(
      (method, params, options) => this.rpc.sendRequest(method, params, options),
      () => this.state.connectionState
    );
    this.events = new OpenClawClientEvents({
      data: this.data,
      getConnectionState: () => this.state.connectionState,
      getConnectionError: () => this.state.lastConnectionError,
    });
    this.rpc = new OpenClawClientRpc({
      getSocket: () => this.state.socket,
      getTimeoutMs: () => this.state.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      onAuthError: (error) => {
        if (isAuthError(error.code)) {
          void openClawAuth.expireSession(error.message);
        }
      },
    });
    this.websocket = new OpenClawClientWebSocket({
      state: this.state,
      data: this.data,
      events: this.events,
      rpc: this.rpc,
    });
  }

  configure(nextConfig: Partial<OpenClawClientConfig>) {
    this.state.config = {
      ...this.state.config,
      ...nextConfig,
      baseUrl: nextConfig.baseUrl
        ? normalizeBaseUrl(nextConfig.baseUrl)
        : this.state.config.baseUrl,
    };
    this.state.reconnectConfig = {
      ...this.state.reconnectConfig,
      ...nextConfig.reconnect,
    };
  }

  getConnectionState() {
    return this.state.connectionState;
  }

  getConnectionError() {
    return this.state.lastConnectionError;
  }

  hasSnapshot() {
    return this.data.hasSnapshot();
  }

  subscribeToConnectionState(listener: OpenClawConnectionListener) {
    return this.events.subscribeToConnectionState(listener);
  }

  subscribeToPushEvents(listener: OpenClawPushEventListener) {
    return this.events.subscribeToPushEvents(listener);
  }

  async connect() {
    return this.websocket.connect();
  }

  disconnect(reason = 'Client closed connection.') {
    this.websocket.disconnect(reason);
  }

  peekOverview() {
    return this.data.peekOverview();
  }

  peekAgent(agentId: string) {
    return this.data.peekAgent(agentId);
  }

  peekAgents(query?: AgentQuery) {
    return this.data.peekAgents(query);
  }

  peekConversation(query: ConversationQuery) {
    return this.data.peekConversation(query);
  }

  peekRuns(query?: RunsQuery) {
    return this.data.peekRuns(query);
  }

  peekIncidents(query?: IncidentsQuery) {
    return this.data.peekIncidents(query);
  }

  getConversationKeyForAgent(agentId: string) {
    return this.data.getConversationKeyForAgent(agentId);
  }

  getAgentIdForConversation(sessionKey: string) {
    return this.data.getAgentIdForConversation(sessionKey);
  }

  async getOverview(signal?: AbortSignal) {
    await this.connect();
    await this.data.refreshGatewayData(signal);

    const overview = this.data.peekOverview();
    if (!overview) {
      throw new OpenClawClientError('Gateway hello snapshot was not available after connect.', {
        code: 'HELLO_MISSING',
      });
    }

    return overview;
  }

  async getAgents(query?: AgentQuery, signal?: AbortSignal) {
    await this.connect();
    await this.data.refreshGatewayData(signal);
    return this.peekAgents(query);
  }

  async getAgent(agentId: string, signal?: AbortSignal) {
    await this.connect();
    await this.data.refreshGatewayData(signal);
    const agent = this.data.peekAgent(agentId);

    if (!agent) {
      throw new OpenClawClientError('Agent not found.', {
        code: 'AGENT_NOT_FOUND',
        status: 404,
      });
    }

    const recentRuns = this.data.peekRuns({ agentId }).items;
    const incidents = this.data.peekIncidents({ agentId }).items;

    return {
      ...agent,
      recentRuns,
      incidents,
      systemPrompt: '',
    } satisfies GatewayAgentDetailResponse;
  }

  async getConversation(query: ConversationQuery, signal?: AbortSignal) {
    await this.connect();
    const sessionKey = this.data.resolveSessionKey(query);

    if (!sessionKey) {
      return createEmptyConversationResponse(query.agentId, query.conversationId);
    }

    const payload = await this.request(
      'chat.history',
      {
        sessionKey,
        limit: query.limit ?? 100,
      },
      {
        signal,
        retryable: false,
      }
    );

    const agentId = this.getAgentIdForConversation(sessionKey) ?? query.agentId ?? '';
    const conversation = normalizeConversationHistory(payload, sessionKey, agentId);
    this.data.upsertConversation(conversation);

    return this.data.peekConversation({ conversationId: sessionKey }) ?? conversation;
  }

  async sendMessage(input: SendMessageInput, signal?: AbortSignal) {
    await this.connect();
    const sessionKey = this.data.resolveOutgoingSessionKey(input);

    if (!sessionKey) {
      throw new OpenClawClientError('A conversationId or agentId is required.', {
        code: 'SESSION_KEY_REQUIRED',
      });
    }

    const timestamp = new Date().toISOString();
    const idempotencyKey = createId();
    const agentId = input.agentId ?? this.getAgentIdForConversation(sessionKey) ?? '';
    const userMessage: GatewayConversationMessageResponse = {
      id: `client:${idempotencyKey}`,
      agentId,
      role: 'user',
      content: input.content,
      createdAt: timestamp,
      conversationId: sessionKey,
      runId: null,
      status: 'complete',
      metadata: input.metadata,
    };

    const runPayload = await this.request(
      'chat.send',
      {
        sessionKey,
        message: input.content,
        deliver: false,
        idempotencyKey,
      },
      {
        signal,
        retryable: false,
      }
    );

    this.data.upsertConversationMessage(sessionKey, userMessage);
    this.data.upsertRun(
      normalizeRunPayload(runPayload, {
        agentId,
        conversationId: sessionKey,
        title: 'Chat response',
        summary: 'Run started from operator message.',
        status: 'queued',
        createdAt: timestamp,
      })
    );

    return {
      conversationId: sessionKey,
      acceptedAt: timestamp,
      message: userMessage,
    } satisfies GatewayMessageSendResponse;
  }

  async getRuns(query?: RunsQuery, signal?: AbortSignal) {
    await this.connect();
    await this.data.refreshGatewayData(signal);
    return this.peekRuns(query);
  }

  async getIncidents(query?: IncidentsQuery, _signal?: AbortSignal) {
    await this.connect();
    return this.peekIncidents(query);
  }

  async retryRun(runId: string, signal?: AbortSignal) {
    await this.connect();
    await this.request('runs.retry', { runId }, { signal });
  }

  async restartAgent(agentId: string, signal?: AbortSignal) {
    await this.connect();
    await this.request('agents.restart', { agentId }, { signal });
  }

  async pingAgent(agentId: string, signal?: AbortSignal) {
    await this.connect();
    await this.request('agents.ping', { agentId }, { signal });
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    options: RequestOptions = {}
  ) {
    try {
      return await this.rpc.request(() => this.connect(), method, params, options);
    } catch (error) {
      throw normalizeError(error, `${method} request failed.`);
    }
  }
}

export function createOpenClawClient(config: OpenClawClientConfig) {
  return new OpenClawClient(config);
}

export function createStoredSessionClient(
  config: Omit<OpenClawClientConfig, 'getAuthToken'> &
    Partial<Pick<OpenClawClientConfig, 'getAuthToken'>>
) {
  return new OpenClawClient({
    timeoutMs: DEFAULT_TIMEOUT_MS,
    reconnect: DEFAULT_RECONNECT_CONFIG,
    ...config,
    getAuthToken: config.getAuthToken ?? (() => openClawAuth.getValidAccessToken()),
  });
}
