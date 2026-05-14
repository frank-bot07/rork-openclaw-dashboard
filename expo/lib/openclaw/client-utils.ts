import type {
  OpenClawClientConfig,
  OpenClawPushEventMessage,
  OpenClawRpcResponseMessage,
} from '@/lib/openclaw/client-types';
import { OpenClawClientError } from '@/lib/openclaw/client-types';

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

export function toWebSocketUrl(baseUrl: string) {
  const url = new URL(normalizeBaseUrl(baseUrl));

  if (url.protocol === 'http:') {
    url.protocol = 'ws:';
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:';
  }

  return url.toString();
}

export async function resolveAuthToken(config: OpenClawClientConfig) {
  if (config.getAuthToken) {
    return config.getAuthToken();
  }

  return config.authToken;
}

export function parseSocketMessage(
  data: unknown
): OpenClawPushEventMessage | OpenClawRpcResponseMessage | null {
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
    console.error('[OpenClaw] Ignoring malformed WebSocket payload:', error instanceof Error ? error.message : String(error));
  }

  return null;
}

export function rpcResponseToError(
  message: OpenClawRpcResponseMessage,
  fallbackMessage: string
) {
  return new OpenClawClientError(message.error?.message ?? fallbackMessage, {
    code: message.error?.code ?? 'RPC_ERROR',
    details: message.error?.details ?? message.payload,
    requestId: message.id,
  });
}

export function normalizeError(
  error: unknown,
  fallbackMessage = 'OpenClaw request failed.'
) {
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

export function resolveSocketCloseCode(code: number) {
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

export function isAuthError(code?: string) {
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

export function getArray(value: unknown) {
  return Array.isArray(value) ? value : null;
}

export function normalizeStringArray(value: unknown) {
  const items = getArray(value);

  if (!items) {
    return null;
  }

  return items.filter((item): item is string => typeof item === 'string');
}

export function dedupeStrings(items: (string | null | undefined)[]) {
  return [...new Set(items.filter((item): item is string => typeof item === 'string' && item.length > 0))];
}

export function dedupeById<T extends { id: string }>(items: T[]) {
  const byId = new Map<string, T>();

  items.forEach((item) => {
    byId.set(item.id, item);
  });

  return [...byId.values()];
}

export function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

export function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

export function firstBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value;
    }
  }

  return undefined;
}

export function safeHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

export function createId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    return `${Date.now()}-${array[0].toString(16).padStart(8, '0')}`;
  }

  throw new Error('Secure random source not available');
}
