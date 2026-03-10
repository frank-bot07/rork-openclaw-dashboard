import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { useSessionStore } from '@/stores/sessionStore';
import type { ConnectionState, GatewayCapabilities, Session } from '@/types/openclaw';

const SESSION_TOKENS_KEY = 'openclaw.session.tokens';
const SESSION_METADATA_KEY = 'openclaw.session.metadata';
const LAST_GATEWAY_URL_KEY = 'openclaw.gateway-url';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'openclaw.mobile',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const SESSION_EXPIRED_MESSAGE = 'Session expired. Please reconnect.';
let expiringSessionPromise: Promise<void> | null = null;
let hasWarnedWebStorageFallback = false;

export const DEFAULT_GATEWAY_CAPABILITIES: GatewayCapabilities = {
  canReadOverview: false,
  canReadAgents: false,
  canReadRuns: false,
  canReadIncidents: false,
  canReadConversation: false,
  canWriteConversation: false,
  canRetryRun: false,
  canRestartAgent: false,
  canPingAgent: false,
  supportsStreaming: false,
  supportsRealtimeEvents: false,
  supportsPolling: true,
};

export interface SessionTokens {
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
}

export interface SessionBootstrapInput {
  id: string;
  gatewayUrl: string;
  operatorId?: string | null;
  operatorName?: string | null;
  connectionState?: ConnectionState;
  capabilities?: Partial<GatewayCapabilities>;
  connectedAt?: string | null;
  issuedAt?: string | null;
  lastValidatedAt?: string | null;
  gatewayName?: string | null;
  gatewayVersion?: string | null;
  metadata?: Record<string, unknown>;
}

export const openClawAuth = {
  async saveTokens(tokens: SessionTokens) {
    await setStoredTokensRaw(JSON.stringify(tokens));
  },

  async getTokens() {
    const rawValue = await getStoredTokensRaw();
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as SessionTokens;
    } catch (error) {
      console.error('[Auth] Failed to parse stored tokens.', error);
      return null;
    }
  },

  async getAccessToken() {
    return (await this.getValidatedTokens())?.accessToken ?? null;
  },

  async getValidAccessToken() {
    return (await this.getValidatedTokens({ throwOnExpired: true }))?.accessToken ?? null;
  },

  async hasActiveSession() {
    return Boolean(await this.getAccessToken());
  },

  async saveGatewayUrl(gatewayUrl: string) {
    await AsyncStorage.setItem(LAST_GATEWAY_URL_KEY, gatewayUrl.trim());
  },

  async getLastGatewayUrl() {
    const gatewayUrl = await AsyncStorage.getItem(LAST_GATEWAY_URL_KEY);
    return gatewayUrl?.trim() ? gatewayUrl.trim() : null;
  },

  async clearTokens() {
    await deleteStoredTokens();
  },

  async saveSession(session: Session) {
    const normalizedSession: Session = {
      ...session,
      connectedAt: session.connectedAt ?? session.lastValidatedAt ?? session.issuedAt ?? new Date().toISOString(),
      gatewayName:
        session.gatewayName ??
        (typeof session.metadata?.gatewayName === 'string' ? session.metadata.gatewayName : null),
      gatewayVersion:
        session.gatewayVersion ??
        (typeof session.metadata?.gatewayVersion === 'string' ? session.metadata.gatewayVersion : null),
    };

    const storedTokens = await this.getTokens();
    if (storedTokens?.accessToken) {
      await this.saveTokens({
        ...storedTokens,
        accessTokenExpiresAt:
          normalizedSession.accessTokenExpiresAt ?? storedTokens.accessTokenExpiresAt ?? null,
        refreshTokenExpiresAt:
          normalizedSession.refreshTokenExpiresAt ?? storedTokens.refreshTokenExpiresAt ?? null,
      });
    }

    await Promise.all([
      AsyncStorage.setItem(
        SESSION_METADATA_KEY,
        JSON.stringify({
          ...normalizedSession,
          capabilities: {
            ...DEFAULT_GATEWAY_CAPABILITIES,
            ...normalizedSession.capabilities,
          },
        })
      ),
      this.saveGatewayUrl(normalizedSession.gatewayUrl),
    ]);
  },

  async getSession(): Promise<Session | null> {
    const [tokens, storedSession, lastGatewayUrl] = await Promise.all([
      this.getValidatedTokens(),
      AsyncStorage.getItem(SESSION_METADATA_KEY),
      this.getLastGatewayUrl(),
    ]);

    if (!tokens?.accessToken) {
      return null;
    }

    if (!storedSession) {
      if (!lastGatewayUrl) {
        return null;
      }

      return this.bootstrapSession({
        id: lastGatewayUrl,
        gatewayUrl: lastGatewayUrl,
      });
    }

    try {
      const parsed = JSON.parse(storedSession) as Session;
      return {
        ...parsed,
        gatewayUrl: parsed.gatewayUrl,
        connectionState: parsed.connectionState ?? 'connected',
        capabilities: {
          ...DEFAULT_GATEWAY_CAPABILITIES,
          ...parsed.capabilities,
        },
        connectedAt: parsed.connectedAt ?? parsed.lastValidatedAt ?? parsed.issuedAt ?? null,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? parsed.accessTokenExpiresAt ?? null,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? parsed.refreshTokenExpiresAt ?? null,
        gatewayName:
          parsed.gatewayName ??
          (typeof parsed.metadata?.gatewayName === 'string' ? parsed.metadata.gatewayName : null),
        gatewayVersion:
          parsed.gatewayVersion ??
          (typeof parsed.metadata?.gatewayVersion === 'string' ? parsed.metadata.gatewayVersion : null),
      };
    } catch (error) {
      console.error('[Auth] Failed to parse stored session metadata.', error);

      if (!lastGatewayUrl) {
        return null;
      }

      return this.bootstrapSession({
        id: lastGatewayUrl,
        gatewayUrl: lastGatewayUrl,
      });
    }
  },

  async clearSession() {
    await Promise.all([
      this.clearTokens(),
      AsyncStorage.removeItem(SESSION_METADATA_KEY),
    ]);
  },

  async expireSession(reason = SESSION_EXPIRED_MESSAGE) {
    if (expiringSessionPromise) {
      return expiringSessionPromise;
    }

    expiringSessionPromise = (async () => {
      await this.clearSession();
      useSessionStore.getState().setUnauthorized(reason);
    })().finally(() => {
      expiringSessionPromise = null;
    });

    return expiringSessionPromise;
  },

  async logout() {
    await this.clearSession();
  },

  async bootstrapSession(input: SessionBootstrapInput): Promise<Session | null> {
    const tokens = await this.getValidatedTokens();
    if (!tokens?.accessToken) {
      return null;
    }

    return {
      id: input.id,
      gatewayUrl: input.gatewayUrl,
      operatorId: input.operatorId ?? null,
      operatorName: input.operatorName ?? null,
      connectionState: input.connectionState ?? 'connected',
      capabilities: {
        ...DEFAULT_GATEWAY_CAPABILITIES,
        ...input.capabilities,
      },
      connectedAt: input.connectedAt ?? input.lastValidatedAt ?? input.issuedAt ?? new Date().toISOString(),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
      gatewayName: input.gatewayName ?? null,
      gatewayVersion: input.gatewayVersion ?? null,
      metadata: input.metadata,
      lastValidatedAt: input.lastValidatedAt ?? null,
      issuedAt: input.issuedAt ?? null,
    };
  },

  async getValidatedTokens(options?: { throwOnExpired?: boolean }) {
    const tokens = await this.getTokens();
    if (!tokens?.accessToken) {
      return null;
    }

    if (!isExpiredTimestamp(tokens.accessTokenExpiresAt)) {
      return tokens;
    }

    console.warn('[Auth] Access token has expired. Expiring stored session.');
    await this.expireSession();

    if (options?.throwOnExpired) {
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }

    return null;
  },
};

function isExpiredTimestamp(value?: string | null) {
  if (!value) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    console.warn('[Auth] Ignoring invalid access token expiration timestamp.');
    return false;
  }

  return Date.now() >= timestamp;
}

async function setStoredTokensRaw(value: string) {
  if (Platform.OS === 'web') {
    const localStorage = getWebStorage();
    localStorage?.setItem(SESSION_TOKENS_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(SESSION_TOKENS_KEY, value, SECURE_STORE_OPTIONS);
}

async function getStoredTokensRaw() {
  if (Platform.OS === 'web') {
    return getWebStorage()?.getItem(SESSION_TOKENS_KEY) ?? null;
  }

  return SecureStore.getItemAsync(SESSION_TOKENS_KEY, SECURE_STORE_OPTIONS);
}

async function deleteStoredTokens() {
  if (Platform.OS === 'web') {
    getWebStorage()?.removeItem(SESSION_TOKENS_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_TOKENS_KEY, SECURE_STORE_OPTIONS);
}

function getWebStorage() {
  warnWebStorageFallback();

  if (typeof globalThis.localStorage === 'undefined') {
    console.error('[Auth] localStorage is unavailable on web. Session persistence is disabled.');
    return null;
  }

  return globalThis.localStorage;
}

function warnWebStorageFallback() {
  if (hasWarnedWebStorageFallback) {
    return;
  }

  hasWarnedWebStorageFallback = true;
  console.warn('[Auth] SecureStore is unavailable on web. Falling back to localStorage.');
}
