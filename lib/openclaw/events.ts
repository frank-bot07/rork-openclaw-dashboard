import { OpenClawClientError } from '@/lib/openclaw/client';
import type { ConnectionState, EventPayload, GatewayCollectionResponse } from '@/types/openclaw';

type AuthTokenResolver = () => Promise<string | null | undefined> | string | null | undefined;
type QueryValue = string | number | boolean | null | undefined;

interface EventSourceLike {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
  onerror: ((event: unknown) => void) | null;
}

type EventSourceFactory = (
  url: string,
  init?: {
    headers?: Record<string, string>;
  }
) => EventSourceLike;

export type RealtimeTransport = 'auto' | 'sse' | 'polling';

export interface OpenClawEventsAdapterConfig {
  baseUrl: string;
  getAuthToken?: AuthTokenResolver;
  fetchImpl?: typeof fetch;
  eventSourceFactory?: EventSourceFactory;
  pollIntervalMs?: number;
  transport?: RealtimeTransport;
}

export interface SubscribeToEventsOptions {
  conversationId?: string;
  agentId?: string;
  cursor?: string;
  limit?: number;
  transport?: RealtimeTransport;
  pollIntervalMs?: number;
  onEvent: (event: EventPayload) => void;
  onError?: (error: OpenClawClientError) => void;
  onConnectionStateChange?: (state: ConnectionState) => void;
}

export interface OpenClawEventSubscription {
  close: () => void;
}

const DEFAULT_POLL_INTERVAL_MS = 4_000;

export class OpenClawEventsAdapter {
  constructor(private readonly config: OpenClawEventsAdapterConfig) {}

  subscribe(options: SubscribeToEventsOptions): OpenClawEventSubscription {
    const transport = options.transport ?? this.config.transport ?? 'auto';
    const pollIntervalMs = options.pollIntervalMs ?? this.config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    let cursor = options.cursor;
    let closed = false;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;
    let source: EventSourceLike | null = null;

    const notifyConnection = (state: ConnectionState) => {
      options.onConnectionStateChange?.(state);
    };

    const emitEvent = (event: EventPayload) => {
      cursor = event.createdAt;
      options.onEvent(event);
    };

    const handleError = (error: unknown) => {
      const normalized = normalizeEventError(error);
      options.onError?.(normalized);
      notifyConnection('reconnecting');
    };

    const close = () => {
      closed = true;
      if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
      }

      source?.close();
      source = null;
      notifyConnection('disconnected');
    };

    const schedulePoll = () => {
      if (closed) {
        return;
      }

      pollTimeout = setTimeout(() => {
        void poll();
      }, pollIntervalMs);
    };

    const poll = async () => {
      notifyConnection(cursor ? 'reconnecting' : 'connecting');

      try {
        const response = await this.fetchImpl()(buildUrl(this.config.baseUrl, '/api/v1/events', {
          conversationId: options.conversationId,
          agentId: options.agentId,
          cursor,
          limit: options.limit,
        }), {
          headers: await this.resolveHeaders(),
        });

        if (!response.ok) {
          throw new OpenClawClientError('Failed to poll events', {
            status: response.status,
            requestId: response.headers.get('x-request-id'),
          });
        }

        const body = (await response.json()) as GatewayCollectionResponse<EventPayload>;
        body.items.forEach((event) => emitEvent(normalizeEventPayload(event)));
        cursor = body.nextCursor ?? cursor;
        notifyConnection('connected');
      } catch (error) {
        handleError(error);
      } finally {
        schedulePoll();
      }
    };

    const startSse = async () => {
      if (!this.config.eventSourceFactory) {
        throw new OpenClawClientError('No EventSource factory configured', {
          code: 'SSE_UNAVAILABLE',
        });
      }

      notifyConnection('connecting');
      const sourceUrl = buildUrl(this.config.baseUrl, '/api/v1/events/stream', {
        conversationId: options.conversationId,
        agentId: options.agentId,
        cursor,
      });

      source = this.config.eventSourceFactory(sourceUrl, {
        headers: await this.resolveHeaders(),
      });

      source.addEventListener('message', (event) => {
        if (closed || !event.data) {
          return;
        }

        try {
          const parsed = JSON.parse(event.data) as EventPayload | EventPayload[];
          const events = Array.isArray(parsed) ? parsed : [parsed];
          events.map(normalizeEventPayload).forEach((payload) => emitEvent(payload));
          notifyConnection('connected');
        } catch (error) {
          handleError(error);
        }
      });

      source.onerror = (event) => {
        handleError(event);
        source?.close();
        source = null;

        if (!closed && transport === 'auto') {
          void poll();
        }
      };
    };

    if (transport === 'sse') {
      void startSse().catch((error) => {
        handleError(error);
      });
    } else if (transport === 'auto' && this.config.eventSourceFactory) {
      void startSse().catch((error) => {
        handleError(error);
        void poll();
      });
    } else {
      void poll();
    }

    return { close };
  }

  private fetchImpl() {
    return this.config.fetchImpl ?? fetch;
  }

  private async resolveHeaders() {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    const authToken = await this.config.getAuthToken?.();
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    return headers;
  }
}

export function createOpenClawEventsAdapter(config: OpenClawEventsAdapterConfig) {
  return new OpenClawEventsAdapter(config);
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
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

  return new OpenClawClientError('Unknown event stream failure');
}

function normalizeEventPayload(event: EventPayload): EventPayload {
  return {
    ...event,
    createdAt: event.createdAt ?? new Date().toISOString(),
    payload: event.payload ?? {},
  };
}
