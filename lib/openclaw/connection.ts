import { DEFAULT_GATEWAY_CAPABILITIES } from '@/lib/openclaw/auth';
import { OpenClawClientError } from '@/lib/openclaw/client';
import type { GatewayOverviewResponse, Session } from '@/types/openclaw';

const LOCAL_GATEWAY_PATTERNS = [
  /^localhost$/i,
  /^127(?:\.\d{1,3}){3}$/,
  /^10(?:\.\d{1,3}){3}$/,
  /^192\.168(?:\.\d{1,3}){2}$/,
  /^172\.(1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/,
  /^::1$/,
];

export function normalizeGatewayUrl(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('Enter your gateway URL.');
  }

  const normalizedInput = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${isLocalGatewayInput(trimmed) ? 'http' : 'https'}://${trimmed}`;

  let url: URL;
  try {
    url = new URL(normalizedInput);
  } catch {
    throw new Error('Enter a valid gateway URL.');
  }

  if (!/^https?:$/.test(url.protocol)) {
    throw new Error('Gateway URL must start with http:// or https://.');
  }

  return url.toString().replace(/\/+$/, '');
}

export function buildSessionFromOverview(
  overview: GatewayOverviewResponse,
  gatewayUrl: string,
  previousSession?: Session | null
): Session {
  const rawSession = overview.session ?? {};
  const metadata =
    rawSession.metadata && typeof rawSession.metadata === 'object'
      ? (rawSession.metadata as Record<string, unknown>)
      : {};

  return {
    id: rawSession.id ?? previousSession?.id ?? overview.gateway.id ?? gatewayUrl,
    gatewayUrl,
    operatorId: rawSession.operatorId ?? previousSession?.operatorId ?? null,
    operatorName: rawSession.operatorName ?? previousSession?.operatorName ?? null,
    connectionState: 'connected',
    connectedAt: previousSession?.connectedAt ?? new Date().toISOString(),
    capabilities: {
      ...DEFAULT_GATEWAY_CAPABILITIES,
      ...overview.gateway.capabilities,
      ...previousSession?.capabilities,
      ...rawSession.capabilities,
    },
    issuedAt: rawSession.issuedAt ?? previousSession?.issuedAt ?? null,
    lastValidatedAt: new Date().toISOString(),
    accessTokenExpiresAt:
      rawSession.accessTokenExpiresAt ?? previousSession?.accessTokenExpiresAt ?? null,
    refreshTokenExpiresAt:
      rawSession.refreshTokenExpiresAt ?? previousSession?.refreshTokenExpiresAt ?? null,
    gatewayName: overview.gateway.name ?? previousSession?.gatewayName ?? null,
    gatewayVersion: overview.gateway.version ?? previousSession?.gatewayVersion ?? null,
    metadata: {
      ...previousSession?.metadata,
      ...metadata,
      gatewayName: overview.gateway.name ?? null,
      gatewayOnline: overview.gateway.online,
      gatewayVersion: overview.gateway.version ?? null,
    },
  };
}

export function isUnauthorizedConnectionError(error: unknown) {
  return error instanceof OpenClawClientError && (error.status === 401 || error.status === 403);
}

export function toConnectionErrorMessage(error: unknown) {
  if (isUnauthorizedConnectionError(error)) {
    return 'Operator token was rejected by the gateway. Check the token and try again.';
  }

  if (error instanceof OpenClawClientError) {
    if (error.code === 'REQUEST_TIMEOUT') {
      return 'The gateway did not respond in time. Verify the URL and network access.';
    }

    if (typeof error.status === 'number' && error.status >= 500) {
      return 'The gateway responded with an internal error. Try again in a moment.';
    }

    if (!error.status) {
      return 'Unable to reach the gateway. Verify the URL and network access.';
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Connection failed. Try again.';
}

function isLocalGatewayInput(value: string) {
  const withoutScheme = value.replace(/^https?:\/\//i, '');
  const hostWithPort = withoutScheme.split('/')[0] ?? withoutScheme;

  if (!hostWithPort) {
    return false;
  }

  const hostname = hostWithPort
    .replace(/:\d+$/, '')
    .replace(/^\[/, '')
    .replace(/\]$/, '');

  return LOCAL_GATEWAY_PATTERNS.some((pattern) => pattern.test(hostname));
}
