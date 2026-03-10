import { openClawAuth } from '@/lib/openclaw/auth';
import type {
  AgentQuery,
  ConversationQuery,
  GatewayActionResponse,
  GatewayAgentDetailResponse,
  GatewayAgentResponse,
  GatewayCollectionResponse,
  GatewayConversationResponse,
  GatewayIncidentResponse,
  GatewayMessageSendResponse,
  GatewayOverviewResponse,
  GatewayRunResponse,
  IncidentsQuery,
  RunsQuery,
  SendMessageInput,
} from '@/types/openclaw';

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | (string | number | boolean)[];

type AuthTokenResolver = () => Promise<string | null | undefined> | string | null | undefined;

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | null;
  query?: Record<string, QueryValue>;
  retryable?: boolean;
  timeoutMs?: number;
}

export interface OpenClawRetryConfig {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatusCodes: number[];
}

export interface OpenClawClientConfig {
  baseUrl: string;
  authToken?: string | null;
  getAuthToken?: AuthTokenResolver;
  timeoutMs?: number;
  retry?: number | Partial<OpenClawRetryConfig>;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_CONFIG: OpenClawRetryConfig = {
  attempts: 2,
  baseDelayMs: 250,
  maxDelayMs: 1_500,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

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

  constructor(config: OpenClawClientConfig) {
    this.config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl),
    };
  }

  configure(nextConfig: Partial<OpenClawClientConfig>) {
    this.config = {
      ...this.config,
      ...nextConfig,
      baseUrl: nextConfig.baseUrl ? normalizeBaseUrl(nextConfig.baseUrl) : this.config.baseUrl,
    };
  }

  async getOverview(signal?: AbortSignal) {
    return this.request<GatewayOverviewResponse>('/api/v1/overview', { signal });
  }

  async getAgents(query?: AgentQuery, signal?: AbortSignal) {
    return this.request<GatewayCollectionResponse<GatewayAgentResponse>>('/api/v1/agents', {
      query: serializeFilters(query),
      signal,
    });
  }

  async getAgent(agentId: string, signal?: AbortSignal) {
    return this.request<GatewayAgentDetailResponse>(`/api/v1/agents/${encodeURIComponent(agentId)}`, {
      signal,
    });
  }

  async getConversation(query: ConversationQuery, signal?: AbortSignal) {
    return this.request<GatewayConversationResponse>(resolveConversationPath(query), {
      query: serializeFilters(query.conversationId ? omit(query, 'conversationId') : omit(query, 'agentId')),
      signal,
    });
  }

  async sendMessage(input: SendMessageInput, signal?: AbortSignal) {
    return this.request<GatewayMessageSendResponse>(resolveConversationMessagesPath(input), {
      method: 'POST',
      body: {
        content: input.content,
        metadata: input.metadata,
      },
      retryable: false,
      signal,
    });
  }

  async getRuns(query?: RunsQuery, signal?: AbortSignal) {
    return this.request<GatewayCollectionResponse<GatewayRunResponse>>('/api/v1/runs', {
      query: serializeFilters(query),
      signal,
    });
  }

  async getIncidents(query?: IncidentsQuery, signal?: AbortSignal) {
    return this.request<GatewayCollectionResponse<GatewayIncidentResponse>>('/api/v1/incidents', {
      query: serializeFilters(query),
      signal,
    });
  }

  async retryRun(runId: string, signal?: AbortSignal) {
    return this.request<GatewayActionResponse>(`/api/v1/runs/${encodeURIComponent(runId)}/retry`, {
      method: 'POST',
      body: {},
      retryable: false,
      signal,
    });
  }

  async restartAgent(agentId: string, signal?: AbortSignal) {
    return this.request<GatewayActionResponse>(`/api/v1/agents/${encodeURIComponent(agentId)}/restart`, {
      method: 'POST',
      body: {},
      retryable: false,
      signal,
    });
  }

  async pingAgent(agentId: string, signal?: AbortSignal) {
    return this.request<GatewayActionResponse>(`/api/v1/agents/${encodeURIComponent(agentId)}/ping`, {
      method: 'POST',
      body: {},
      retryable: false,
      signal,
    });
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const retryConfig = resolveRetryConfig(this.config.retry);
    const method = (options.method ?? 'GET').toUpperCase();
    const retryable = options.retryable ?? method === 'GET';
    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timeoutMs = options.timeoutMs ?? this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timeoutId = setTimeout(() => {
        controller.abort(
          new OpenClawClientError(`Request timed out after ${timeoutMs}ms`, {
            code: 'REQUEST_TIMEOUT',
          })
        );
      }, timeoutMs);

      try {
        const headers = await this.resolveHeaders(options.headers);
        const response = await this.fetchImpl()(buildUrl(this.config.baseUrl, path, options.query), {
          ...options,
          body: toRequestBody(options.body, headers),
          headers,
          signal: mergeAbortSignals(controller.signal, options.signal),
        });

        clearTimeout(timeoutId);
        if (!response.ok) {
          const clientError = await toClientError(response);

          if (clientError.status === 401 || clientError.status === 403) {
            await openClawAuth.expireSession(clientError.message || 'Session expired. Please reconnect.');
          }

          throw clientError;
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await parseResponseBody(response)) as T;
      } catch (error) {
        clearTimeout(timeoutId);
        const normalized = normalizeError(error);
        attempt += 1;

        if (!retryable || attempt > retryConfig.attempts || !isRetryableError(normalized, retryConfig)) {
          throw normalized;
        }

        await sleep(Math.min(retryConfig.baseDelayMs * attempt, retryConfig.maxDelayMs));
      }
    }
  }

  private async resolveHeaders(requestHeaders?: HeadersInit) {
    const headers = new Headers(this.config.headers);

    if (requestHeaders) {
      const nextHeaders = new Headers(requestHeaders);
      nextHeaders.forEach((value, key) => headers.set(key, value));
    }

    const authToken = await resolveAuthToken(this.config);
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }

    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json');
    }

    return headers;
  }

  private fetchImpl() {
    return this.config.fetchImpl ?? fetch;
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
    retry: DEFAULT_RETRY_CONFIG,
    ...config,
    getAuthToken: config.getAuthToken ?? (() => openClawAuth.getValidAccessToken()),
  });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${baseUrl}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, String(entry)));
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function resolveRetryConfig(retry?: OpenClawClientConfig['retry']): OpenClawRetryConfig {
  if (typeof retry === 'number') {
    return {
      ...DEFAULT_RETRY_CONFIG,
      attempts: retry,
    };
  }

  return {
    ...DEFAULT_RETRY_CONFIG,
    ...retry,
    retryableStatusCodes: retry?.retryableStatusCodes ?? DEFAULT_RETRY_CONFIG.retryableStatusCodes,
  };
}

async function resolveAuthToken(config: OpenClawClientConfig) {
  if (config.getAuthToken) {
    return config.getAuthToken();
  }

  return config.authToken;
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

async function toClientError(response: Response) {
  const details = await parseResponseBody(response).catch(() => undefined);
  const message =
    (typeof details === 'object' && details !== null && 'message' in details && typeof details.message === 'string'
      ? details.message
      : response.statusText) || `Request failed with status ${response.status}`;

  return new OpenClawClientError(message, {
    status: response.status,
    code:
      typeof details === 'object' && details !== null && 'code' in details && typeof details.code === 'string'
        ? details.code
        : undefined,
    requestId: response.headers.get('x-request-id'),
    details,
  });
}

function normalizeError(error: unknown) {
  if (error instanceof OpenClawClientError) {
    return error;
  }

  if (error instanceof Error) {
    return new OpenClawClientError(error.message, {
      code: error.name,
    });
  }

  return new OpenClawClientError('Unknown request failure');
}

function isRetryableError(error: OpenClawClientError, retryConfig: OpenClawRetryConfig) {
  if (error.code === 'AbortError' || error.code === 'REQUEST_TIMEOUT') {
    return true;
  }

  if (typeof error.status === 'number') {
    return retryConfig.retryableStatusCodes.includes(error.status);
  }

  return true;
}

function toRequestBody(body: RequestOptions['body'], headers: Headers) {
  if (body == null) {
    return undefined;
  }

  if (body instanceof FormData || typeof body === 'string' || body instanceof Blob || body instanceof ArrayBuffer) {
    return body;
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return JSON.stringify(body);
}

function resolveConversationPath(query: ConversationQuery) {
  if (query.conversationId) {
    return `/api/v1/conversations/${encodeURIComponent(query.conversationId)}`;
  }

  if (query.agentId) {
    return `/api/v1/agents/${encodeURIComponent(query.agentId)}/conversation`;
  }

  throw new OpenClawClientError('A conversationId or agentId is required');
}

function resolveConversationMessagesPath(input: Pick<SendMessageInput, 'conversationId' | 'agentId'>) {
  if (input.conversationId) {
    return `/api/v1/conversations/${encodeURIComponent(input.conversationId)}/messages`;
  }

  if (input.agentId) {
    return `/api/v1/agents/${encodeURIComponent(input.agentId)}/messages`;
  }

  throw new OpenClawClientError('A conversationId or agentId is required');
}

function serializeFilters<T extends object>(filters?: T) {
  if (!filters) {
    return undefined;
  }

  const serialized: Record<string, QueryValue> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      serialized[key] = value.filter(
        (entry): entry is string | number | boolean =>
          typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
      );
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      serialized[key] = value;
    }
  }

  return serialized;
}

function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const nextValue = { ...value };
  delete nextValue[key];
  return nextValue;
}

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function mergeAbortSignals(primary: AbortSignal, secondary?: AbortSignal | null) {
  if (!secondary) {
    return primary;
  }

  if (secondary.aborted) {
    primary.throwIfAborted?.();
    return secondary;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  const cleanup = () => {
    primary.removeEventListener('abort', abort);
    secondary.removeEventListener('abort', abort);
  };

  primary.addEventListener('abort', abort, { once: true });
  secondary.addEventListener('abort', abort, { once: true });
  controller.signal.addEventListener('abort', cleanup, { once: true });

  return controller.signal;
}
