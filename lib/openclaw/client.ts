import { Platform } from 'react-native';
import { openClawAuth } from '@/lib/openclaw/auth';
import type {
  AgentQuery,
  AgentStatus,
  ChannelType,
  ConnectionState,
  ConversationQuery,
  GatewayActionResponse,
  GatewayActivityResponse,
  GatewayAgentDetailResponse,
  GatewayAgentResponse,
  GatewayCapabilities,
  GatewayCollectionResponse,
  GatewayConversationMessageResponse,
  GatewayConversationResponse,
  GatewayIncidentResponse,
  GatewayMessageSendResponse,
  GatewayOverviewResponse,
  GatewayRunResponse,
  IncidentsQuery,
  RunsQuery,
  SendMessageInput,
} from '@/types/openclaw';

type AuthTokenResolver = () => Promise<string | null | undefined> | string | null | undefined;

interface RequestOptions {
  signal?: AbortSignal;
  retryable?: boolean;
  timeoutMs?: number;
}

export interface OpenClawReconnectConfig {
  enabled: boolean;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface OpenClawClientConfig {
  baseUrl: string;
  authToken?: string | null;
  getAuthToken?: AuthTokenResolver;
  timeoutMs?: number;
  reconnect?: Partial<OpenClawReconnectConfig>;
  clientVersion?: string;
  WebSocketImpl?: typeof WebSocket;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  retry?: number | Record<string, unknown>;
}

export interface OpenClawPushEventMessage {
  type: 'event';
  event: string;
  payload: unknown;
  seq?: number;
}

export interface OpenClawRpcResponseMessage {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export type OpenClawConnectionListener = (
  state: ConnectionState,
  error: OpenClawClientError | null
) => void;

export type OpenClawPushEventListener = (event: OpenClawPushEventMessage) => void;

interface PendingRequest {
  reject: (error: OpenClawClientError) => void;
  resolve: (payload: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  abortCleanup?: () => void;
}

interface SnapshotState {
  overview: GatewayOverviewResponse | null;
  agentsById: Map<string, GatewayAgentResponse>;
  sessionKeyByAgentId: Map<string, string>;
  agentIdBySessionKey: Map<string, string>;
  conversationsBySessionKey: Map<string, GatewayConversationResponse>;
  runsById: Map<string, GatewayRunResponse>;
  incidentsById: Map<string, GatewayIncidentResponse>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RECONNECT_CONFIG: OpenClawReconnectConfig = {
  enabled: true,
  baseDelayMs: 750,
  maxDelayMs: 30_000,
};
const DEFAULT_SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing'];
const DEFAULT_CAPS = ['tool-events'];
const SUPPORTED_PROTOCOL_VERSION = 3;
const RUNS_REFRESH_INTERVAL_MS = 30_000;

export class OpenClawClientError extends Error {
  status?: number;
  code?: string;
  requestId?: string | null;
  details?: unknown;

  constructor(message: string, init: Partial<OpenClawClientError> = {}) {
    super(message);
    this.name = 'OpenClawClientError';
    Object.assign(this, init);
  }
}

export class OpenClawClient {
  private config: OpenClawClientConfig;
  private reconnectConfig: OpenClawReconnectConfig;
  private socket: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private pushListeners = new Set<OpenClawPushEventListener>();
  private connectionListeners = new Set<OpenClawConnectionListener>();
  private snapshot: SnapshotState = createEmptySnapshotState();
  private connectPromise: Promise<GatewayOverviewResponse> | null = null;
  private connectPromiseResolve: ((overview: GatewayOverviewResponse) => void) | null = null;
  private connectPromiseReject: ((error: OpenClawClientError) => void) | null = null;
  private handshakeRequestId: string | null = null;
  private handshakeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastConnectionError: OpenClawClientError | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private instanceId = createId();
  private reconnectAttempt = 0;
  private hasConnectedAtLeastOnce = false;
  private manuallyClosed = false;
  private lastRunsRefreshAt = 0;
  private refreshRunsPromise: Promise<void> | null = null;

  constructor(config: OpenClawClientConfig) {
    this.config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl),
    };
    this.reconnectConfig = {
      ...DEFAULT_RECONNECT_CONFIG,
      ...config.reconnect,
    };
  }

  configure(nextConfig: Partial<OpenClawClientConfig>) {
    this.config = {
      ...this.config,
      ...nextConfig,
      baseUrl: nextConfig.baseUrl ? normalizeBaseUrl(nextConfig.baseUrl) : this.config.baseUrl,
    };
    this.reconnectConfig = {
      ...this.reconnectConfig,
      ...nextConfig.reconnect,
    };
  }

  getConnectionState() {
    return this.connectionState;
  }

  getConnectionError() {
    return this.lastConnectionError;
  }

  hasSnapshot() {
    return Boolean(this.snapshot.overview);
  }

  subscribeToConnectionState(listener: OpenClawConnectionListener) {
    this.connectionListeners.add(listener);
    listener(this.connectionState, this.lastConnectionError);

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

  async connect() {
    if (this.snapshot.overview && this.connectionState === 'connected') {
      return cloneOverview(this.snapshot.overview);
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    const WebSocketImpl = this.getWebSocketImpl();
    if (!WebSocketImpl) {
      throw new OpenClawClientError('WebSocket is unavailable in this environment.', {
        code: 'WS_UNAVAILABLE',
      });
    }

    this.manuallyClosed = false;
    this.clearReconnectTimer();

    this.connectPromise = new Promise<GatewayOverviewResponse>((resolve, reject) => {
      this.connectPromiseResolve = resolve;
      this.connectPromiseReject = reject;

      try {
        const socket = new WebSocketImpl(toWebSocketUrl(this.config.baseUrl));
        this.socket = socket;
        this.setConnectionState(this.hasConnectedAtLeastOnce ? 'reconnecting' : 'connecting');

        socket.onopen = () => {
          this.armHandshakeTimeout('Timed out waiting for gateway auth challenge.');
        };

        socket.onmessage = (message) => {
          void this.handleSocketMessage(message.data);
        };

        socket.onerror = () => {
          if (!this.lastConnectionError) {
            this.lastConnectionError = new OpenClawClientError('WebSocket connection failed.', {
              code: 'WS_ERROR',
            });
          }
        };

        socket.onclose = (event) => {
          this.handleSocketClose(event);
        };
      } catch (error) {
        const normalized = normalizeError(error, 'Failed to create WebSocket connection.');
        this.rejectConnectPromise(normalized);
        this.scheduleReconnect(normalized);
      }
    });

    return this.connectPromise;
  }

  disconnect(reason = 'Client closed connection.') {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.clearHandshakeTimeout();
    this.handshakeRequestId = null;
    this.rejectAllPendingRequests(
      new OpenClawClientError(reason, {
        code: 'WS_CLOSED',
      })
    );

    if (this.socket) {
      const socket = this.socket;
      this.socket = null;

      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) {
        socket.close();
      }
    }

    this.rejectConnectPromise(
      new OpenClawClientError(reason, {
        code: 'WS_CLOSED',
      })
    );
    this.setConnectionState('disconnected');
  }

  peekOverview() {
    return this.snapshot.overview ? cloneOverview(this.snapshot.overview) : null;
  }

  peekAgent(agentId: string) {
    const agent = this.snapshot.agentsById.get(agentId);
    return agent ? cloneAgent(agent) : null;
  }

  peekAgents(query?: AgentQuery): GatewayCollectionResponse<GatewayAgentResponse> {
    const items = filterAgents(
      [...this.snapshot.agentsById.values()].map(cloneAgent),
      query
    );

    return {
      items,
      total: items.length,
    };
  }

  peekConversation(query: ConversationQuery) {
    const sessionKey = this.resolveSessionKey(query);

    if (!sessionKey) {
      return null;
    }

    const conversation = this.snapshot.conversationsBySessionKey.get(sessionKey);
    return conversation ? cloneConversation(conversation) : null;
  }

  peekRuns(query?: RunsQuery): GatewayCollectionResponse<GatewayRunResponse> {
    const items = filterRuns([...this.snapshot.runsById.values()].map(cloneRun), query);

    return {
      items,
      total: items.length,
    };
  }

  peekIncidents(query?: IncidentsQuery): GatewayCollectionResponse<GatewayIncidentResponse> {
    const items = filterIncidents(
      [...this.snapshot.incidentsById.values()].map(cloneIncident),
      query
    );

    return {
      items,
      total: items.length,
    };
  }

  getConversationKeyForAgent(agentId: string) {
    return this.snapshot.sessionKeyByAgentId.get(agentId) ?? null;
  }

  getAgentIdForConversation(sessionKey: string) {
    return this.snapshot.agentIdBySessionKey.get(sessionKey) ?? null;
  }

  async getOverview(_signal?: AbortSignal) {
    await this.connect();

    if (!this.snapshot.overview) {
      throw new OpenClawClientError('Gateway hello snapshot was not available after connect.', {
        code: 'HELLO_MISSING',
      });
    }

    return cloneOverview(this.snapshot.overview);
  }

  async getAgents(query?: AgentQuery, _signal?: AbortSignal) {
    await this.connect();
    return this.peekAgents(query);
  }

  async getAgent(agentId: string, _signal?: AbortSignal) {
    await this.connect();
    const agent = this.snapshot.agentsById.get(agentId);

    if (!agent) {
      throw new OpenClawClientError('Agent not found.', {
        code: 'AGENT_NOT_FOUND',
        status: 404,
      });
    }

    const recentRuns = filterRuns([...this.snapshot.runsById.values()].map(cloneRun), { agentId });
    const incidents = filterIncidents([...this.snapshot.incidentsById.values()].map(cloneIncident), {
      agentId,
    });

    return {
      ...cloneAgent(agent),
      recentRuns,
      incidents,
      systemPrompt: '',
    } satisfies GatewayAgentDetailResponse;
  }

  async getConversation(query: ConversationQuery, signal?: AbortSignal) {
    await this.connect();
    const sessionKey = this.resolveSessionKey(query);

    if (!sessionKey) {
      return createEmptyConversationResponse(query.agentId, query.conversationId);
    }

    const payload = await this.request('chat.history', {
      sessionKey,
      limit: query.limit ?? 100,
    }, {
      signal,
      retryable: false,
    });

    const agentId = this.getAgentIdForConversation(sessionKey) ?? query.agentId ?? '';
    const conversation = normalizeConversationHistory(payload, sessionKey, agentId);
    this.upsertConversation(conversation);

    return cloneConversation(this.snapshot.conversationsBySessionKey.get(sessionKey) ?? conversation);
  }

  async sendMessage(input: SendMessageInput, signal?: AbortSignal) {
    await this.connect();
    const sessionKey = resolveOutgoingSessionKey(input, this.snapshot);

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

    const runPayload = await this.request('chat.send', {
      sessionKey,
      message: input.content,
      deliver: true,
      idempotencyKey,
    }, {
      signal,
      retryable: false,
    });

    this.upsertConversationMessage(sessionKey, userMessage);
    this.upsertRun(normalizeRunPayload(runPayload, {
      agentId,
      conversationId: sessionKey,
      title: 'Chat response',
      summary: 'Run started from operator message.',
      status: 'queued',
      createdAt: timestamp,
    }));

    return {
      conversationId: sessionKey,
      acceptedAt: timestamp,
      message: userMessage,
    } satisfies GatewayMessageSendResponse;
  }

  async getRuns(query?: RunsQuery, signal?: AbortSignal) {
    await this.connect();
    await this.refreshRunsFromUsage(signal);
    return this.peekRuns(query);
  }

  async getIncidents(query?: IncidentsQuery, _signal?: AbortSignal) {
    await this.connect();
    return this.peekIncidents(query);
  }

  async retryRun(_runId: string, _signal?: AbortSignal) {
    throw unsupportedActionError('retryRun');
  }

  async restartAgent(_agentId: string, _signal?: AbortSignal) {
    throw unsupportedActionError('restartAgent');
  }

  async pingAgent(_agentId: string, _signal?: AbortSignal) {
    throw unsupportedActionError('pingAgent');
  }

  private async request(method: string, params: Record<string, unknown>, options: RequestOptions = {}) {
    await this.connect();

    const socket = this.socket;
    if (!socket || socket.readyState !== socket.OPEN || this.connectionState !== 'connected') {
      throw new OpenClawClientError('Gateway connection is not ready.', {
        code: 'WS_NOT_CONNECTED',
      });
    }

    if (options.signal?.aborted) {
      throw new OpenClawClientError('Request aborted.', {
        code: 'AbortError',
      });
    }

    const id = createId();
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise<unknown>((resolve, reject) => {
      const abortListener = () => {
        this.clearPendingRequest(id);
        reject(
          new OpenClawClientError('Request aborted.', {
            code: 'AbortError',
          })
        );
      };

      const timeoutId = setTimeout(() => {
        this.clearPendingRequest(id);
        reject(
          new OpenClawClientError(`Request timed out after ${timeoutMs}ms.`, {
            code: 'REQUEST_TIMEOUT',
          })
        );
      }, timeoutMs);

      if (options.signal) {
        options.signal.addEventListener('abort', abortListener, { once: true });
      }

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId,
        abortCleanup: options.signal
          ? () => options.signal?.removeEventListener('abort', abortListener)
          : undefined,
      });

      try {
        socket.send(
          JSON.stringify({
            type: 'req',
            id,
            method,
            params,
          })
        );
      } catch (error) {
        this.clearPendingRequest(id);
        reject(normalizeError(error, `Failed to send ${method} request.`));
      }
    });
  }

  private async handleSocketMessage(data: unknown) {
    const message = parseSocketMessage(data);

    if (!message) {
      return;
    }

    if (message.type === 'event') {
      if (message.event === 'connect.challenge') {
        await this.handleConnectChallenge();
        return;
      }

      this.applyPushEvent(message);
      this.emitPushEvent(message);
      return;
    }

    this.handleResponse(message);
  }

  private async handleConnectChallenge() {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN || this.handshakeRequestId) {
      return;
    }

    try {
      const authToken = await resolveAuthToken(this.config);

      if (!authToken) {
        throw new OpenClawClientError('Operator token is required.', {
          code: 'AUTH_TOKEN_MISSING',
        });
      }

      const requestId = createId();
      this.handshakeRequestId = requestId;
      this.armHandshakeTimeout('Timed out waiting for gateway hello response.');
      this.socket.send(
        JSON.stringify({
          type: 'req',
          id: requestId,
          method: 'connect',
          params: {
            minProtocol: SUPPORTED_PROTOCOL_VERSION,
            maxProtocol: SUPPORTED_PROTOCOL_VERSION,
            client: {
              id: 'openclaw-mobile',
              version: this.config.clientVersion ?? '1.0.0',
              platform: Platform.OS,
              mode: 'ui',
              instanceId: this.instanceId,
            },
            role: 'operator',
            scopes: DEFAULT_SCOPES,
            auth: {
              token: authToken,
            },
            caps: DEFAULT_CAPS,
          },
        })
      );
    } catch (error) {
      const normalized = normalizeError(error, 'Failed to authenticate with the gateway.');
      this.lastConnectionError = normalized;
      if (isAuthError(normalized.code)) {
        await openClawAuth.expireSession(normalized.message);
      }
      this.rejectConnectPromise(normalized);
      this.socket?.close();
    }
  }

  private handleResponse(message: OpenClawRpcResponseMessage) {
    if (message.id === this.handshakeRequestId) {
      this.clearHandshakeTimeout();
      this.handshakeRequestId = null;

      if (!message.ok) {
        const error = rpcResponseToError(message, 'Gateway authentication failed.');
        this.lastConnectionError = error;
        this.rejectConnectPromise(error);

        if (isAuthError(error.code)) {
          void openClawAuth.expireSession(error.message);
        }

        this.socket?.close();
        return;
      }

      const overview = normalizeHelloPayload(message.payload, this.config.baseUrl);
      this.replaceOverviewSnapshot(overview);
      this.lastConnectionError = null;
      this.reconnectAttempt = 0;
      this.hasConnectedAtLeastOnce = true;
      this.setConnectionState('connected');
      this.resolveConnectPromise(overview);
      return;
    }

    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return;
    }

    this.clearPendingRequest(message.id);

    if (!message.ok) {
      const error = rpcResponseToError(message, 'Gateway request failed.');

      if (isAuthError(error.code)) {
        void openClawAuth.expireSession(error.message);
      }

      pending.reject(error);
      return;
    }

    pending.resolve(message.payload);
  }

  private handleSocketClose(event: CloseEvent) {
    const error =
      this.lastConnectionError ??
      new OpenClawClientError(event.reason || 'Gateway connection closed.', {
        code: resolveSocketCloseCode(event.code),
      });

    this.socket = null;
    this.handshakeRequestId = null;
    this.clearHandshakeTimeout();
    this.rejectAllPendingRequests(error);

    if (this.connectionState !== 'connected') {
      this.rejectConnectPromise(error);
    }

    if (this.manuallyClosed) {
      this.setConnectionState('disconnected');
      return;
    }

    if (isAuthError(error.code)) {
      this.setConnectionState('unauthorized', error);
      return;
    }

    this.scheduleReconnect(error);
  }

  private scheduleReconnect(error: OpenClawClientError) {
    if (!this.reconnectConfig.enabled || this.manuallyClosed) {
      this.setConnectionState('disconnected', error);
      return;
    }

    this.clearReconnectTimer();
    this.reconnectAttempt += 1;
    const delayMs = Math.min(
      this.reconnectConfig.baseDelayMs * 2 ** Math.max(this.reconnectAttempt - 1, 0),
      this.reconnectConfig.maxDelayMs
    );
    this.setConnectionState('reconnecting', error);

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      void this.connect().catch((nextError) => {
        const normalized = normalizeError(nextError, 'Gateway reconnect attempt failed.');
        this.lastConnectionError = normalized;
        this.scheduleReconnect(normalized);
      });
    }, delayMs);
  }

  private applyPushEvent(event: OpenClawPushEventMessage) {
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

    this.syncOverviewCollections();
  }

  private emitPushEvent(event: OpenClawPushEventMessage) {
    this.pushListeners.forEach((listener) => {
      listener(event);
    });
  }

  private applyPresencePayload(payload: unknown) {
    const root = asRecord(payload);
    const entries = getArray(root?.presence) ?? (Array.isArray(payload) ? payload : [payload]);

    for (const entry of entries) {
      const record = asRecord(asRecord(entry)?.agent) ?? asRecord(entry);
      const agentId = firstString(record?.id, record?.agentId);
      const existing = agentId ? this.snapshot.agentsById.get(agentId) : undefined;
      const agent = normalizeAgentPayload(record, existing ?? undefined);

      if (agent) {
        this.upsertAgent(agent);
      }
    }
  }

  private applyAgentPayload(payload: unknown) {
    const root = asRecord(asRecord(payload)?.agent) ?? asRecord(payload);
    const agentId = firstString(root?.id, root?.agentId);
    const existing = agentId ? this.snapshot.agentsById.get(agentId) : undefined;
    const agent = normalizeAgentPayload(root, existing);

    if (agent) {
      this.upsertAgent(agent);
    }

    const run = normalizeRunPayload(root?.currentRun ?? root?.run ?? root?.latestRun, {
      agentId: agent?.id ?? existing?.id ?? '',
      conversationId: agent?.conversationId ?? existing?.conversationId ?? null,
    });

    if (run) {
      this.upsertRun(run);
    }

    const incident = normalizeIncidentPayload(root?.incident ?? root?.latestIncident);
    if (incident) {
      this.upsertIncident(incident);
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
      this.snapshot.agentIdBySessionKey.get(sessionKey) ??
      this.findAgentIdByConversationId(sessionKey) ??
      '';
    const conversation = ensureConversation(this.snapshot.conversationsBySessionKey.get(sessionKey), {
      id: sessionKey,
      agentId,
      agentName: agentId ? this.snapshot.agentsById.get(agentId)?.name : undefined,
    });

    const state = firstString(root?.state, root?.phase) ?? 'final';
    const messageRoot = asRecord(root?.message);

    if (state === 'delta') {
      const messageId =
        firstString(messageRoot?.id, messageRoot?.messageId, root?.messageId) ??
        `stream:${sessionKey}:${firstString(root?.runId) ?? 'run'}`;
      const delta =
        firstString(messageRoot?.delta, root?.delta, messageRoot?.content) ??
        (typeof root?.message === 'string' ? root.message : '');

      const currentMessage =
        conversation.messages.find((message) => message.id === messageId) ??
        createAssistantMessage({
          id: messageId,
          agentId,
          conversationId: sessionKey,
          runId: firstString(root?.runId) ?? null,
          content: '',
          status: 'streaming',
        });

      this.upsertConversationMessage(sessionKey, {
        ...currentMessage,
        content: `${currentMessage.content}${delta}`,
        createdAt: firstString(messageRoot?.createdAt, root?.createdAt) ?? new Date().toISOString(),
        runId: firstString(messageRoot?.runId, root?.runId) ?? currentMessage.runId ?? null,
        status: 'streaming',
      });
    } else if (state === 'final') {
      const message = normalizeConversationMessage(messageRoot ?? root, agentId, sessionKey, 'assistant');

      if (message) {
        this.upsertConversationMessage(sessionKey, {
          ...message,
          status: 'complete',
        });
      }
    } else if (state === 'error' || state === 'aborted') {
      const errorMessage = firstString(root?.errorMessage, root?.message, root?.reason);

      this.upsertConversationMessage(
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
      createdAt: firstString(root?.createdAt) ?? new Date().toISOString(),
    });

    if (run) {
      this.upsertRun(run);
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

    runs.forEach((run) => this.upsertRun(run));
    incidents.forEach((incident) => this.upsertIncident(incident));
  }

  private replaceOverviewSnapshot(overview: GatewayOverviewResponse) {
    this.snapshot = createEmptySnapshotState();
    this.snapshot.overview = cloneOverview(overview);

    for (const agent of overview.agents ?? []) {
      const normalizedAgent = normalizeAgentPayload(agent);
      if (normalizedAgent) {
        this.upsertAgent(normalizedAgent);
      }
    }

    for (const run of overview.recentRuns ?? []) {
      this.upsertRun(normalizeRunPayload(run));
    }

    for (const incident of overview.incidents ?? []) {
      this.upsertIncident(normalizeIncidentPayload(incident));
    }

    this.syncOverviewCollections();
  }

  private syncOverviewCollections() {
    if (!this.snapshot.overview) {
      return;
    }

    const agents = sortAgents([...this.snapshot.agentsById.values()].map(cloneAgent));
    const recentRuns = sortRuns([...this.snapshot.runsById.values()].map(cloneRun));
    const incidents = sortIncidents([...this.snapshot.incidentsById.values()].map(cloneIncident));
    const existingStats = this.snapshot.overview.stats ?? {};
    const gateway = this.snapshot.overview.gateway;

    this.snapshot.overview = {
      ...this.snapshot.overview,
      gateway: {
        ...gateway,
        online: this.connectionState === 'connected',
      },
      coordinator:
        agents.find((agent) => agent.isCoordinator || agent.role === 'coordinator') ??
        this.snapshot.overview.coordinator ??
        null,
      agents,
      recentRuns,
      incidents,
      stats: {
        ...existingStats,
        totalAgents: agents.length,
        onlineAgents: agents.filter((agent) => agent.status !== 'offline').length,
        openIncidents: incidents.filter((incident) => incident.status !== 'resolved').length,
        activeRuns: recentRuns.filter((run) => run.status === 'queued' || run.status === 'running').length,
      },
    };
  }

  private upsertAgent(agent: GatewayAgentResponse) {
    const existing = this.snapshot.agentsById.get(agent.id);
    const merged = mergeAgent(existing, agent);
    this.snapshot.agentsById.set(merged.id, merged);

    const sessionKey = merged.conversationId ?? null;
    if (sessionKey) {
      this.snapshot.sessionKeyByAgentId.set(merged.id, sessionKey);
      this.snapshot.agentIdBySessionKey.set(sessionKey, merged.id);
    }

    if (merged.currentRun) {
      this.upsertRun(merged.currentRun);
    }
  }

  private upsertRun(run: GatewayRunResponse | null) {
    if (!run?.id) {
      return;
    }

    const existing = this.snapshot.runsById.get(run.id);
    const merged = mergeRun(existing, run);
    this.snapshot.runsById.set(merged.id, merged);
  }

  private upsertIncident(incident: GatewayIncidentResponse | null) {
    if (!incident?.id) {
      return;
    }

    const existing = this.snapshot.incidentsById.get(incident.id);
    const merged = mergeIncident(existing, incident);
    this.snapshot.incidentsById.set(merged.id, merged);
  }

  private upsertConversation(conversation: GatewayConversationResponse) {
    const existing = this.snapshot.conversationsBySessionKey.get(conversation.id);
    const merged = mergeConversation(existing, conversation);
    this.snapshot.conversationsBySessionKey.set(merged.id, merged);

    if (merged.agentId) {
      this.snapshot.agentIdBySessionKey.set(merged.id, merged.agentId);
      this.snapshot.sessionKeyByAgentId.set(merged.agentId, merged.id);
    }

    if (merged.latestRun) {
      this.upsertRun(merged.latestRun);
    }
  }

  private upsertConversationMessage(
    sessionKey: string,
    message: GatewayConversationMessageResponse | null
  ) {
    if (!message) {
      return;
    }

    const existing = ensureConversation(this.snapshot.conversationsBySessionKey.get(sessionKey), {
      id: sessionKey,
      agentId: message.agentId,
      agentName: message.agentId ? this.snapshot.agentsById.get(message.agentId)?.name : undefined,
    });
    const byId = new Map(existing.messages.map((entry) => [entry.id, entry]));
    byId.set(message.id, mergeConversationMessage(byId.get(message.id), message));
    const nextConversation: GatewayConversationResponse = {
      ...existing,
      id: sessionKey,
      agentId: existing.agentId || message.agentId,
      messages: sortConversationMessages([...byId.values()].map(cloneMessage)),
      nextCursor: message.createdAt,
    };

    this.upsertConversation(nextConversation);
  }

  private resolveSessionKey(query: ConversationQuery) {
    if (query.conversationId && !query.conversationId.startsWith('pending:')) {
      return query.conversationId;
    }

    if (query.agentId) {
      return this.snapshot.sessionKeyByAgentId.get(query.agentId) ?? null;
    }

    return null;
  }

  private findAgentIdByConversationId(sessionKey: string) {
    return this.snapshot.agentIdBySessionKey.get(sessionKey) ?? null;
  }

  private async refreshRunsFromUsage(signal?: AbortSignal) {
    if (Date.now() - this.lastRunsRefreshAt < RUNS_REFRESH_INTERVAL_MS && this.snapshot.runsById.size > 0) {
      return;
    }

    if (this.refreshRunsPromise) {
      return this.refreshRunsPromise;
    }

    this.refreshRunsPromise = (async () => {
      try {
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        const payload = await this.request('sessions.usage', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          limit: 100,
        }, {
          signal,
          retryable: false,
        });

        collectNormalizedRuns(payload).forEach((run) => {
          this.upsertRun(run);
        });
        this.lastRunsRefreshAt = Date.now();
        this.syncOverviewCollections();
      } catch (error) {
        const normalized = normalizeError(error, 'Failed to refresh session usage.');

        if (normalized.code !== 'METHOD_NOT_FOUND') {
          this.lastConnectionError = normalized;
        }
      }
    })().finally(() => {
      this.refreshRunsPromise = null;
    });

    return this.refreshRunsPromise;
  }

  private setConnectionState(state: ConnectionState, error: OpenClawClientError | null = null) {
    this.connectionState = state;
    this.lastConnectionError = error;

    if (this.snapshot.overview) {
      this.snapshot.overview = {
        ...this.snapshot.overview,
        gateway: {
          ...this.snapshot.overview.gateway,
          online: state === 'connected',
        },
      };
    }

    this.connectionListeners.forEach((listener) => {
      listener(state, error);
    });
  }

  private resolveConnectPromise(overview: GatewayOverviewResponse) {
    const resolve = this.connectPromiseResolve;
    this.connectPromise = null;
    this.connectPromiseResolve = null;
    this.connectPromiseReject = null;

    resolve?.(cloneOverview(overview));
  }

  private rejectConnectPromise(error: OpenClawClientError) {
    const reject = this.connectPromiseReject;
    this.connectPromise = null;
    this.connectPromiseResolve = null;
    this.connectPromiseReject = null;
    reject?.(error);
  }

  private clearPendingRequest(id: string) {
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    pending.abortCleanup?.();
    this.pendingRequests.delete(id);
  }

  private rejectAllPendingRequests(error: OpenClawClientError) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      this.clearPendingRequest(id);
      pending.reject(error);
    }
  }

  private armHandshakeTimeout(message: string) {
    this.clearHandshakeTimeout();
    this.handshakeTimeoutId = setTimeout(() => {
      const error = new OpenClawClientError(message, {
        code: 'REQUEST_TIMEOUT',
      });
      this.lastConnectionError = error;
      this.rejectConnectPromise(error);
      this.socket?.close();
    }, this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  private clearHandshakeTimeout() {
    if (this.handshakeTimeoutId) {
      clearTimeout(this.handshakeTimeoutId);
      this.handshakeTimeoutId = null;
    }
  }

  private clearReconnectTimer() {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
  }

  private getWebSocketImpl() {
    return this.config.WebSocketImpl ?? globalThis.WebSocket;
  }
}

export function createOpenClawClient(config: OpenClawClientConfig) {
  return new OpenClawClient(config);
}

export function createStoredSessionClient(
  config: Omit<OpenClawClientConfig, 'getAuthToken'> & Partial<Pick<OpenClawClientConfig, 'getAuthToken'>>
) {
  return new OpenClawClient({
    timeoutMs: DEFAULT_TIMEOUT_MS,
    reconnect: DEFAULT_RECONNECT_CONFIG,
    ...config,
    getAuthToken: config.getAuthToken ?? (() => openClawAuth.getValidAccessToken()),
  });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

function toWebSocketUrl(baseUrl: string) {
  const url = new URL(normalizeBaseUrl(baseUrl));

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  return url.toString();
}

async function resolveAuthToken(config: OpenClawClientConfig) {
  if (config.getAuthToken) {
    return config.getAuthToken();
  }

  return config.authToken;
}

function parseSocketMessage(data: unknown): OpenClawPushEventMessage | OpenClawRpcResponseMessage | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as unknown;
    const record = asRecord(parsed);

    if (!record || typeof record.type !== 'string') {
      return null;
    }

    if (record.type === 'event' && typeof record.event === 'string') {
      return {
        type: 'event',
        event: record.event,
        payload: record.payload,
        seq: typeof record.seq === 'number' ? record.seq : undefined,
      };
    }

    if (record.type === 'res' && typeof record.id === 'string') {
      return {
        type: 'res',
        id: record.id,
        ok: record.ok === true,
        payload: record.payload,
        error: asRecord(record.error)
          ? {
              code: firstString(asRecord(record.error)?.code),
              message: firstString(asRecord(record.error)?.message),
              details: asRecord(record.error)?.details,
            }
          : undefined,
      };
    }
  } catch (error) {
    console.error('[OpenClaw] Ignoring malformed WebSocket payload.', error);
  }

  return null;
}

function rpcResponseToError(message: OpenClawRpcResponseMessage, fallbackMessage: string) {
  return new OpenClawClientError(message.error?.message ?? fallbackMessage, {
    code: message.error?.code ?? 'RPC_ERROR',
    details: message.error?.details ?? message.payload,
    requestId: message.id,
  });
}

function normalizeError(error: unknown, fallbackMessage = 'OpenClaw request failed.') {
  if (error instanceof OpenClawClientError) {
    return error;
  }

  if (error instanceof Error) {
    return new OpenClawClientError(error.message || fallbackMessage, {
      code: error.name,
    });
  }

  return new OpenClawClientError(fallbackMessage);
}

function normalizeHelloPayload(payload: unknown, baseUrl: string): GatewayOverviewResponse {
  const root = asRecord(payload);
  const snapshot = asRecord(root?.snapshot) ?? root ?? {};
  const gatewayRecord = asRecord(snapshot.gateway) ?? asRecord(root?.gateway) ?? {};
  const sessionRecord = asRecord(snapshot.session) ?? asRecord(root?.session) ?? {};
  const statsRecord = asRecord(snapshot.stats) ?? asRecord(root?.stats);
  const activityItems = getArray(snapshot.activity) ?? getArray(root?.activity) ?? [];
  const agentItems = [
    ...(getArray(snapshot.agents) ?? []),
    ...(getArray(snapshot.presence) ?? getArray(root?.presence) ?? []),
  ];
  const runItems = [
    ...(getArray(snapshot.recentRuns) ?? []),
    ...(getArray(snapshot.runs) ?? getArray(root?.runs) ?? []),
  ];
  const incidentItems = [
    ...(getArray(snapshot.incidents) ?? []),
    ...(getArray(root?.incidents) ?? []),
  ];
  const agents = dedupeById(
    agentItems
      .map((item) => normalizeAgentPayload(item))
      .filter((item): item is GatewayAgentResponse => Boolean(item))
  );
  const recentRuns = dedupeById(
    runItems
      .map((item) => normalizeRunPayload(item))
      .filter((item): item is GatewayRunResponse => Boolean(item))
  );
  const incidents = dedupeById(
    incidentItems
      .map((item) => normalizeIncidentPayload(item))
      .filter((item): item is GatewayIncidentResponse => Boolean(item))
  );
  const gatewayId =
    firstString(gatewayRecord.id, gatewayRecord.gatewayId, root?.gatewayId) ?? baseUrl;
  const gatewayName =
    firstString(gatewayRecord.name, root?.gatewayName, root?.name) ?? safeHostname(baseUrl);
  const capabilities = normalizeCapabilities(
    asRecord(gatewayRecord.capabilities) ?? asRecord(sessionRecord.capabilities)
  );
  const helloSessionKey = extractSessionKey(root) ?? extractSessionKey(snapshot);
  const activity = activityItems.reduce<GatewayActivityResponse[]>((items, item) => {
    const next = normalizeActivityPayload(item);

    if (next) {
      items.push(next);
    }

    return items;
  }, []);

  return {
    gateway: {
      id: gatewayId,
      name: gatewayName,
      online: true,
      version: firstString(gatewayRecord.version, root?.gatewayVersion),
      uptime: firstString(gatewayRecord.uptime),
      latencyMs: firstNumber(gatewayRecord.latencyMs),
      lastSyncAt: firstString(gatewayRecord.lastSyncAt, root?.connectedAt) ?? new Date().toISOString(),
      capabilities,
    },
    session: {
      id: firstString(sessionRecord.id, root?.sessionId, helloSessionKey) ?? gatewayId,
      operatorId:
        firstString(
          sessionRecord.operatorId,
          root?.operatorId,
          asRecord(root?.operator)?.id
        ) ?? null,
      operatorName:
        firstString(
          sessionRecord.operatorName,
          root?.operatorName,
          asRecord(root?.operator)?.name
        ) ?? null,
      metadata: {
        ...(asRecord(sessionRecord.metadata) ?? {}),
        protocol:
          firstNumber(root?.protocol, snapshot.protocol) ?? SUPPORTED_PROTOCOL_VERSION,
        helloSessionKey,
      },
    },
    stats: statsRecord
      ? {
          totalAgents: firstNumber(statsRecord.totalAgents),
          onlineAgents: firstNumber(statsRecord.onlineAgents),
          activeChannels: firstNumber(statsRecord.activeChannels),
          pendingJobs: firstNumber(statsRecord.pendingJobs),
          openIncidents: firstNumber(statsRecord.openIncidents),
          activeRuns: firstNumber(statsRecord.activeRuns),
        }
      : undefined,
    coordinator:
      normalizeAgentPayload(snapshot.coordinator ?? root?.coordinator) ??
      agents.find((agent) => agent.isCoordinator || agent.role === 'coordinator') ??
      null,
    agents,
    recentRuns,
    incidents,
    activity,
  };
}

function normalizeCapabilities(value: Record<string, unknown> | null | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized: Partial<GatewayCapabilities> = {};
  const booleanKeys: (keyof GatewayCapabilities)[] = [
    'canReadOverview',
    'canReadAgents',
    'canReadRuns',
    'canReadIncidents',
    'canReadConversation',
    'canWriteConversation',
    'canRetryRun',
    'canRestartAgent',
    'canPingAgent',
    'supportsStreaming',
    'supportsRealtimeEvents',
    'supportsPolling',
  ];

  booleanKeys.forEach((key) => {
    const rawValue = value[key];
    if (typeof rawValue === 'boolean') {
      normalized[key] = rawValue;
    }
  });

  return normalized;
}

function normalizeActivityPayload(value: unknown) {
  const record = asRecord(value);
  const id = firstString(record?.id);
  const agentId = firstString(record?.agentId);
  const agentName = firstString(record?.agentName);
  const type = firstString(record?.type);
  const title = firstString(record?.title);
  const detail = firstString(record?.detail);
  const timestamp = firstString(record?.timestamp, record?.createdAt);

  if (!id || !agentId || !agentName || !type || !title || !detail || !timestamp) {
    return null;
  }

  return {
    id,
    agentId,
    agentName,
    type: type as GatewayActivityResponse['type'],
    title,
    detail,
    timestamp,
    channel: firstString(record?.channel) as GatewayActivityResponse['channel'],
    runId: firstString(record?.runId) ?? null,
    incidentId: firstString(record?.incidentId) ?? null,
    severity: firstString(record?.severity) as GatewayActivityResponse['severity'],
  } satisfies GatewayActivityResponse;
}

function normalizeAgentPayload(
  value: unknown,
  fallback?: GatewayAgentResponse
): GatewayAgentResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.agentId) ?? fallback?.id;

  if (!id) {
    return null;
  }

  const conversationId = extractSessionKey(record) ?? fallback?.conversationId ?? null;
  const status = normalizeAgentStatus(
    firstString(record?.status, record?.state, record?.presence) ?? fallback?.status
  );

  return {
    id,
    name: firstString(record?.name, record?.agentName, record?.label) ?? fallback?.name ?? id,
    status,
    model: firstString(record?.model, record?.modelName) ?? fallback?.model ?? 'unknown',
    provider: firstString(record?.provider, record?.vendor) ?? fallback?.provider ?? 'unknown',
    description:
      firstString(record?.description, record?.summary) ?? fallback?.description ?? 'Operational agent',
    agentDir: firstString(record?.agentDir, record?.path) ?? fallback?.agentDir ?? '',
    lastActivityAt:
      firstString(record?.lastActivityAt, record?.updatedAt, record?.lastSeenAt, record?.timestamp) ??
      fallback?.lastActivityAt ??
      new Date().toISOString(),
    role: normalizeAgentRole(record, fallback),
    specialistType:
      firstString(record?.specialistType, record?.kind) ?? fallback?.specialistType ?? null,
    isCoordinator:
      firstBoolean(record?.isCoordinator) ??
      (firstString(record?.role) === 'coordinator'
        ? true
        : (fallback?.isCoordinator ?? false)),
    channels:
      normalizeChannels(record?.channels) ?? fallback?.channels?.map(cloneChannel) ?? [],
    currentRun: normalizeRunPayload(record?.currentRun ?? record?.run ?? record?.latestRun, {
      agentId: id,
      conversationId,
    }),
    allowedActions:
      normalizeStringArray(record?.allowedActions) ??
      fallback?.allowedActions?.slice() ??
      [],
    conversationId,
    metadata: {
      ...(fallback?.metadata ?? {}),
      ...(record ?? {}),
    },
  };
}

function normalizeAgentRole(record: Record<string, unknown> | null | undefined, fallback?: GatewayAgentResponse) {
  const role = firstString(record?.role);

  if (role === 'coordinator' || role === 'specialist') {
    return role;
  }

  if (firstBoolean(record?.isCoordinator)) {
    return 'coordinator';
  }

  return fallback?.role ?? 'specialist';
}

function normalizeChannels(value: unknown) {
  const items = getArray(value);

  if (!items) {
    return null;
  }

  return items
    .map((entry) => {
      const record = asRecord(entry);
      const id = firstString(record?.id, record?.channelId);
      const type = firstString(record?.type);

      if (!id || !type) {
        return null;
      }

      return {
        id,
        type: type as ChannelType,
        identifier: firstString(record?.identifier, record?.handle) ?? '',
        label: firstString(record?.label, record?.name) ?? type,
        connected: firstBoolean(record?.connected) ?? false,
      };
    })
    .filter(
      (
        channel
      ): channel is {
        id: string;
        type: ChannelType;
        identifier: string;
        label: string;
        connected: boolean;
      } => Boolean(channel)
    );
}

function normalizeRunPayload(
  value: unknown,
  fallback?: Partial<GatewayRunResponse>
): GatewayRunResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.runId) ?? fallback?.id;

  if (!id) {
    return null;
  }

  const createdAt =
    firstString(record?.createdAt, record?.timestamp, record?.startedAt, record?.updatedAt) ??
    fallback?.createdAt ??
    new Date().toISOString();
  const status = normalizeRunStatus(
    firstString(record?.status, record?.state) ?? fallback?.status ?? 'queued'
  );

  return {
    id,
    agentId: firstString(record?.agentId) ?? fallback?.agentId ?? '',
    agentName: firstString(record?.agentName) ?? fallback?.agentName ?? '',
    conversationId:
      firstString(record?.conversationId, record?.sessionKey) ??
      fallback?.conversationId ??
      null,
    status,
    title: firstString(record?.title, record?.name) ?? fallback?.title ?? 'Untitled run',
    summary:
      firstString(record?.summary, record?.description, record?.message) ??
      fallback?.summary ??
      (status === 'failed' ? 'Run failed.' : status === 'running' ? 'Run in progress.' : 'Recent run.'),
    createdAt,
    startedAt: firstString(record?.startedAt) ?? fallback?.startedAt ?? null,
    updatedAt: firstString(record?.updatedAt, record?.completedAt) ?? fallback?.updatedAt ?? createdAt,
    completedAt: firstString(record?.completedAt) ?? fallback?.completedAt ?? null,
    durationMs: firstNumber(record?.durationMs) ?? fallback?.durationMs ?? null,
    errorMessage: firstString(record?.errorMessage, record?.error) ?? fallback?.errorMessage ?? null,
    incidentId: firstString(record?.incidentId) ?? fallback?.incidentId ?? null,
    auditId: firstString(record?.auditId) ?? fallback?.auditId ?? null,
    delegatedAgentIds:
      normalizeStringArray(record?.delegatedAgentIds) ??
      fallback?.delegatedAgentIds?.slice() ??
      [],
    delegatedAgentNames:
      normalizeStringArray(record?.delegatedAgentNames) ??
      fallback?.delegatedAgentNames?.slice() ??
      [],
    canRetry: firstBoolean(record?.canRetry) ?? fallback?.canRetry ?? false,
    metadata: {
      ...(fallback?.metadata ?? {}),
      ...(record ?? {}),
    },
  };
}

function normalizeIncidentPayload(
  value: unknown,
  fallback?: GatewayIncidentResponse
): GatewayIncidentResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.incidentId) ?? fallback?.id;

  if (!id) {
    return null;
  }

  const createdAt = firstString(record?.createdAt, record?.timestamp) ?? fallback?.createdAt ?? new Date().toISOString();

  return {
    id,
    title: firstString(record?.title, record?.name) ?? fallback?.title ?? 'Incident',
    summary: firstString(record?.summary, record?.message, record?.description) ?? fallback?.summary ?? 'Operator attention required.',
    severity: normalizeIncidentSeverity(firstString(record?.severity) ?? fallback?.severity),
    status: normalizeIncidentStatus(firstString(record?.status, record?.state) ?? fallback?.status),
    createdAt,
    updatedAt: firstString(record?.updatedAt, record?.resolvedAt) ?? fallback?.updatedAt ?? createdAt,
    resolvedAt: firstString(record?.resolvedAt) ?? fallback?.resolvedAt ?? null,
    agentId: firstString(record?.agentId) ?? fallback?.agentId ?? null,
    agentName: firstString(record?.agentName) ?? fallback?.agentName ?? '',
    runId: firstString(record?.runId) ?? fallback?.runId ?? null,
    conversationId:
      firstString(record?.conversationId, record?.sessionKey) ??
      fallback?.conversationId ??
      null,
    auditId: firstString(record?.auditId) ?? fallback?.auditId ?? null,
    metadata: {
      ...(fallback?.metadata ?? {}),
      ...(record ?? {}),
    },
  };
}

function normalizeConversationHistory(
  payload: unknown,
  sessionKey: string,
  fallbackAgentId: string
): GatewayConversationResponse {
  const record = asRecord(payload) ?? {};
  const messages = (getArray(record.messages) ?? [])
    .map((entry) => normalizeConversationMessage(entry, fallbackAgentId, sessionKey))
    .filter((message): message is GatewayConversationMessageResponse => Boolean(message));

  return {
    id: sessionKey,
    agentId:
      firstString(record.agentId, asRecord(record.agent)?.id) ??
      fallbackAgentId,
    agentName:
      firstString(record.agentName, asRecord(record.agent)?.name) ?? undefined,
    messages: sortConversationMessages(messages),
    events: [],
    latestRun: normalizeRunPayload(record.latestRun, {
      agentId: fallbackAgentId,
      conversationId: sessionKey,
    }),
    nextCursor:
      firstString(record.nextCursor, record.cursor) ??
      (messages.length > 0 ? messages[messages.length - 1]?.createdAt : null) ??
      null,
  };
}

function normalizeConversationMessage(
  value: unknown,
  fallbackAgentId: string,
  sessionKey: string,
  fallbackRole: GatewayConversationMessageResponse['role'] = 'assistant'
): GatewayConversationMessageResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.messageId) ?? `message:${createId()}`;
  const content =
    firstString(record?.content, record?.text, record?.delta) ??
    (typeof value === 'string' ? value : '');

  return {
    id,
    agentId: firstString(record?.agentId) ?? fallbackAgentId,
    role: normalizeMessageRole(firstString(record?.role) ?? fallbackRole),
    content,
    createdAt: firstString(record?.createdAt, record?.timestamp) ?? new Date().toISOString(),
    conversationId:
      firstString(record?.conversationId, record?.sessionKey) ?? sessionKey,
    runId: firstString(record?.runId) ?? null,
    status: normalizeMessageStatus(firstString(record?.status)),
    metadata: {
      ...(record ?? {}),
    },
  };
}

function createEmptyConversationResponse(agentId?: string, conversationId?: string) {
  return {
    id: conversationId ?? `pending:${agentId ?? 'conversation'}`,
    agentId: agentId ?? '',
    messages: [],
    events: [],
    latestRun: null,
    nextCursor: null,
  } satisfies GatewayConversationResponse;
}

function resolveOutgoingSessionKey(
  input: Pick<SendMessageInput, 'agentId' | 'conversationId'>,
  snapshot: SnapshotState
) {
  if (input.conversationId && !input.conversationId.startsWith('pending:')) {
    return input.conversationId;
  }

  if (input.agentId) {
    return snapshot.sessionKeyByAgentId.get(input.agentId) ?? null;
  }

  return null;
}

function unsupportedActionError(action: GatewayActionResponse['action']) {
  return new OpenClawClientError(`${action} is not exposed by the WebSocket gateway protocol.`, {
    code: 'METHOD_NOT_SUPPORTED',
  });
}

function resolveSocketCloseCode(code: number) {
  switch (code) {
    case 1000:
      return 'WS_CLOSED';
    case 1006:
      return 'WS_ABNORMAL_CLOSE';
    case 1011:
      return 'WS_SERVER_ERROR';
    default:
      return 'WS_CLOSED';
  }
}

function mergeAgent(current: GatewayAgentResponse | undefined, next: GatewayAgentResponse) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    channels: next.channels?.length
      ? next.channels.map(cloneChannel)
      : (current.channels ?? []).map(cloneChannel),
    currentRun: next.currentRun ?? current.currentRun ?? null,
    allowedActions: next.allowedActions?.length ? next.allowedActions.slice() : current.allowedActions?.slice(),
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function mergeRun(current: GatewayRunResponse | undefined, next: GatewayRunResponse) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    delegatedAgentIds: next.delegatedAgentIds?.length ? next.delegatedAgentIds.slice() : current.delegatedAgentIds?.slice(),
    delegatedAgentNames: next.delegatedAgentNames?.length ? next.delegatedAgentNames.slice() : current.delegatedAgentNames?.slice(),
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function mergeIncident(current: GatewayIncidentResponse | undefined, next: GatewayIncidentResponse) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function mergeConversation(
  current: GatewayConversationResponse | undefined,
  next: GatewayConversationResponse
) {
  if (!current) {
    return {
      ...next,
      messages: sortConversationMessages(next.messages.map(cloneMessage)),
      events: next.events?.slice() ?? [],
    };
  }

  const messages = new Map<string, GatewayConversationMessageResponse>();
  [...current.messages, ...next.messages].forEach((message) => {
    const existing = messages.get(message.id);
    messages.set(message.id, mergeConversationMessage(existing, message));
  });

  return {
    ...current,
    ...next,
    messages: sortConversationMessages([...messages.values()].map(cloneMessage)),
    events: next.events?.length ? next.events.slice() : current.events?.slice() ?? [],
    latestRun: next.latestRun ?? current.latestRun ?? null,
    nextCursor: next.nextCursor ?? current.nextCursor ?? null,
  };
}

function mergeConversationMessage(
  current: GatewayConversationMessageResponse | undefined,
  next: GatewayConversationMessageResponse
) {
  if (!current) {
    return next;
  }

  const nextStatus = normalizeMessageStatus(next.status) ?? current.status;

  return {
    ...current,
    ...next,
    content:
      next.content.length >= current.content.length ? next.content : current.content,
    status: nextStatus,
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function createEmptySnapshotState(): SnapshotState {
  return {
    overview: null,
    agentsById: new Map(),
    sessionKeyByAgentId: new Map(),
    agentIdBySessionKey: new Map(),
    conversationsBySessionKey: new Map(),
    runsById: new Map(),
    incidentsById: new Map(),
  };
}

function ensureConversation(
  current: GatewayConversationResponse | undefined,
  base: Pick<GatewayConversationResponse, 'id' | 'agentId' | 'agentName'>
) {
  return (
    current ?? {
      id: base.id,
      agentId: base.agentId,
      agentName: base.agentName,
      messages: [],
      events: [],
      latestRun: null,
      nextCursor: null,
    }
  );
}

function createAssistantMessage(input: {
  id: string;
  agentId: string;
  conversationId: string;
  runId?: string | null;
  content: string;
  status: GatewayConversationMessageResponse['status'];
}) {
  return {
    id: input.id,
    agentId: input.agentId,
    role: 'assistant' as const,
    content: input.content,
    createdAt: new Date().toISOString(),
    conversationId: input.conversationId,
    runId: input.runId ?? null,
    status: input.status,
    metadata: {},
  };
}

function sortAgents(items: GatewayAgentResponse[]) {
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

function sortRuns(items: GatewayRunResponse[]) {
  return items.sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
    return rightTime - leftTime;
  });
}

function sortIncidents(items: GatewayIncidentResponse[]) {
  return items.sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
    return rightTime - leftTime;
  });
}

function sortConversationMessages(items: GatewayConversationMessageResponse[]) {
  return items.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });
}

function filterAgents(items: GatewayAgentResponse[], query?: AgentQuery) {
  return items.filter((agent) => {
    const matchesStatus = !query?.status
      ? true
      : Array.isArray(query.status)
        ? query.status.includes(agent.status)
        : agent.status === query.status;
    const matchesSearch = !query?.search
      ? true
      : [agent.name, agent.model ?? '', agent.provider ?? '', agent.description ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query.search.toLowerCase());
    const includeCoordinator = query?.includeCoordinator ?? true;
    const matchesCoordinator = includeCoordinator ? true : !agent.isCoordinator;

    return matchesStatus && matchesSearch && matchesCoordinator;
  });
}

function filterRuns(items: GatewayRunResponse[], query?: RunsQuery) {
  const filtered = items.filter((run) => {
    const matchesStatus = !query?.status
      ? true
      : Array.isArray(query.status)
        ? query.status.includes(run.status)
        : run.status === query.status;
    const matchesAgent = !query?.agentId || run.agentId === query.agentId;
    const matchesConversation = !query?.conversationId || run.conversationId === query.conversationId;

    return matchesStatus && matchesAgent && matchesConversation;
  });

  return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
}

function filterIncidents(items: GatewayIncidentResponse[], query?: IncidentsQuery) {
  const filtered = items.filter((incident) => {
    const matchesStatus = !query?.status
      ? true
      : Array.isArray(query.status)
        ? query.status.includes(incident.status)
        : incident.status === query.status;
    const matchesSeverity = !query?.severity
      ? true
      : Array.isArray(query.severity)
        ? query.severity.includes(incident.severity)
        : incident.severity === query.severity;
    const matchesAgent = !query?.agentId || incident.agentId === query.agentId;
    const matchesRun = !query?.runId || incident.runId === query.runId;

    return matchesStatus && matchesSeverity && matchesAgent && matchesRun;
  });

  return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
}

function collectNormalizedRuns(value: unknown) {
  const items = getArray(value);

  if (items) {
    return items.map((entry) => normalizeRunPayload(entry)).filter((run): run is GatewayRunResponse => Boolean(run));
  }

  const directRun = normalizeRunPayload(value);
  return directRun ? [directRun] : [];
}

function collectNormalizedIncidents(value: unknown) {
  const items = getArray(value);

  if (items) {
    return items
      .map((entry) => normalizeIncidentPayload(entry))
      .filter((incident): incident is GatewayIncidentResponse => Boolean(incident));
  }

  const directIncident = normalizeIncidentPayload(value);
  return directIncident ? [directIncident] : [];
}

function extractSessionKey(record: Record<string, unknown> | null | undefined) {
  return firstString(
    record?.sessionKey,
    record?.conversationId,
    record?.conversationKey,
    record?.threadId,
    asRecord(record?.session)?.key,
    asRecord(record?.session)?.id
  );
}

function normalizeAgentStatus(value: string | AgentStatus | undefined) {
  switch (value) {
    case 'online':
    case 'busy':
    case 'degraded':
    case 'offline':
      return value;
    case 'active':
    case 'ready':
      return 'online';
    case 'idle':
      return 'busy';
    case 'error':
      return 'degraded';
    default:
      return 'offline';
  }
}

function normalizeRunStatus(value: string | undefined) {
  switch (value) {
    case 'queued':
    case 'running':
    case 'succeeded':
    case 'failed':
    case 'cancelled':
    case 'degraded':
      return value;
    case 'complete':
    case 'completed':
    case 'success':
      return 'succeeded';
    case 'error':
      return 'failed';
    default:
      return 'queued';
  }
}

function normalizeIncidentSeverity(value: string | undefined) {
  switch (value) {
    case 'info':
    case 'warning':
    case 'critical':
      return value;
    case 'error':
      return 'critical';
    default:
      return 'warning';
  }
}

function normalizeIncidentStatus(value: string | undefined) {
  switch (value) {
    case 'open':
    case 'acknowledged':
    case 'resolved':
      return value;
    case 'closed':
      return 'resolved';
    default:
      return 'open';
  }
}

function normalizeMessageRole(value: string | undefined) {
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

function normalizeMessageStatus(value: string | undefined) {
  switch (value) {
    case 'pending':
    case 'streaming':
    case 'complete':
    case 'failed':
      return value;
    default:
      return undefined;
  }
}

function mapChatStateToRunStatus(value: string) {
  switch (value) {
    case 'delta':
      return 'running';
    case 'final':
      return 'succeeded';
    case 'aborted':
      return 'cancelled';
    case 'error':
      return 'failed';
    default:
      return 'running';
  }
}

function isAuthError(code?: string) {
  return Boolean(
    code &&
      [
        'AUTH_TOKEN_MISMATCH',
        'AUTH_RATE_LIMITED',
        'AUTH_UNAUTHORIZED',
        'AUTH_TOKEN_MISSING',
      ].includes(code)
  );
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

function normalizeStringArray(value: unknown) {
  const items = getArray(value);

  if (!items) {
    return null;
  }

  return items.filter((item): item is string => typeof item === 'string');
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();

  items.forEach((item) => {
    byId.set(item.id, item);
  });

  return [...byId.values()];
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return undefined;
}

function safeHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function cloneOverview(overview: GatewayOverviewResponse): GatewayOverviewResponse {
  return {
    ...overview,
    gateway: { ...overview.gateway },
    session: overview.session
      ? {
          ...overview.session,
          metadata: overview.session.metadata ? { ...overview.session.metadata } : overview.session.metadata,
        }
      : overview.session,
    stats: overview.stats ? { ...overview.stats } : overview.stats,
    coordinator: overview.coordinator ? cloneAgent(overview.coordinator) : overview.coordinator,
    agents: overview.agents.map(cloneAgent),
    recentRuns: overview.recentRuns?.map(cloneRun),
    incidents: overview.incidents?.map(cloneIncident),
    activity: overview.activity?.map((entry) => ({ ...entry })),
  };
}

function cloneAgent(agent: GatewayAgentResponse): GatewayAgentResponse {
  return {
    ...agent,
    channels: agent.channels?.map(cloneChannel) ?? [],
    currentRun: agent.currentRun ? cloneRun(agent.currentRun) : agent.currentRun,
    allowedActions: agent.allowedActions?.slice(),
    metadata: agent.metadata ? { ...agent.metadata } : agent.metadata,
  };
}

function cloneChannel(channel: NonNullable<GatewayAgentResponse['channels']>[number]) {
  return {
    ...channel,
  };
}

function cloneRun(run: GatewayRunResponse): GatewayRunResponse {
  return {
    ...run,
    delegatedAgentIds: run.delegatedAgentIds?.slice(),
    delegatedAgentNames: run.delegatedAgentNames?.slice(),
    metadata: run.metadata ? { ...run.metadata } : run.metadata,
  };
}

function cloneIncident(incident: GatewayIncidentResponse): GatewayIncidentResponse {
  return {
    ...incident,
    metadata: incident.metadata ? { ...incident.metadata } : incident.metadata,
  };
}

function cloneConversation(conversation: GatewayConversationResponse): GatewayConversationResponse {
  return {
    ...conversation,
    messages: conversation.messages.map(cloneMessage),
    events: conversation.events?.slice() ?? [],
    latestRun: conversation.latestRun ? cloneRun(conversation.latestRun) : conversation.latestRun,
  };
}

function cloneMessage(message: GatewayConversationMessageResponse): GatewayConversationMessageResponse {
  return {
    ...message,
    metadata: message.metadata ? { ...message.metadata } : message.metadata,
  };
}
