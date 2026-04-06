import type {
  ConnectionState,
  GatewayAgentResponse,
  GatewayConversationResponse,
  GatewayIncidentResponse,
  GatewayOverviewResponse,
  GatewayRunResponse,
} from '@/types/openclaw';

export type AuthTokenResolver =
  () => Promise<string | null | undefined> | string | null | undefined;

export interface RequestOptions {
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

export type OpenClawConnectionListener = (
  state: ConnectionState,
  error: OpenClawClientError | null
) => void;

export type OpenClawPushEventListener = (event: OpenClawPushEventMessage) => void;

export interface PendingRequest {
  reject: (error: OpenClawClientError) => void;
  resolve: (payload: unknown) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  abortCleanup?: () => void;
}

export interface SnapshotState {
  overview: GatewayOverviewResponse | null;
  agentsById: Map<string, GatewayAgentResponse>;
  defaultAgentId: string | null;
  sessionKeyByAgentId: Map<string, string>;
  agentIdBySessionKey: Map<string, string>;
  sessionsByKey: Map<string, GatewaySessionSnapshot>;
  conversationsBySessionKey: Map<string, GatewayConversationResponse>;
  runsById: Map<string, GatewayRunResponse>;
  incidentsById: Map<string, GatewayIncidentResponse>;
  nodesById: Map<string, GatewayNodeSnapshot>;
}

export interface GatewaySessionSnapshot {
  sessionKey: string;
  agentId: string;
  agentName?: string;
  status: GatewayRunResponse['status'];
  createdAt: string;
  updatedAt: string;
  model?: string;
  provider?: string;
  channelType?: string | null;
  channelLabel?: string | null;
  channelIdentifier?: string | null;
  connected?: boolean;
  messageCount?: number | null;
  tokenCount?: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  metadata: Record<string, unknown>;
}

export interface GatewayNodeSnapshot {
  id: string;
  label: string;
  status: string;
  lastSeenAt: string | null;
  metadata: Record<string, unknown>;
}

export interface OpenClawClientRuntimeState {
  config: OpenClawClientConfig;
  reconnectConfig: OpenClawReconnectConfig;
  socket: WebSocket | null;
  connectPromise: Promise<GatewayOverviewResponse> | null;
  connectPromiseResolve: ((overview: GatewayOverviewResponse) => void) | null;
  connectPromiseReject: ((error: OpenClawClientError) => void) | null;
  handshakeRequestId: string | null;
  handshakeTimeoutId: ReturnType<typeof setTimeout> | null;
  reconnectTimeoutId: ReturnType<typeof setTimeout> | null;
  lastConnectionError: OpenClawClientError | null;
  connectionState: ConnectionState;
  instanceId: string;
  reconnectAttempt: number;
  hasConnectedAtLeastOnce: boolean;
  manuallyClosed: boolean;
}

export type OpenClawRequestSender = (
  method: string,
  params: Record<string, unknown>,
  options?: RequestOptions
) => Promise<unknown>;

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_RECONNECT_CONFIG: OpenClawReconnectConfig = {
  enabled: true,
  baseDelayMs: 750,
  maxDelayMs: 30_000,
};
export const DEFAULT_SCOPES = ['operator.admin', 'operator.approvals', 'operator.pairing'];
export const DEFAULT_CAPS = ['tool-events'];
export const SUPPORTED_PROTOCOL_VERSION = 3;
export const GATEWAY_DATA_REFRESH_INTERVAL_MS = 30_000;
