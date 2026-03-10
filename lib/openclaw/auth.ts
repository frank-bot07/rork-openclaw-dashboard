import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Alert } from 'react-native';
import { useSessionStore } from '@/stores/sessionStore';
import type { ConnectionState, GatewayCapabilities, Session } from '@/types/openclaw';

const SESSION_TOKENS_KEY = 'openclaw.session.tokens';
const SESSION_METADATA_KEY = 'openclaw.session.metadata';
const LAST_GATEWAY_URL_KEY = 'openclaw.gateway-url';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'openclaw.mobile',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const SESSION_EXPIRED_TITLE = 'Session expired';
const SESSION_EXPIRED_MESSAGE = 'Session expired. Please reconnect.';
let expiringSessionPromise: Promise<void> | null = null;

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
    await SecureStore.setItemAsync(SESSION_TOKENS_KEY, JSON.stringify(tokens), SECURE_STORE_OPTIONS);
  },

  async getTokens() {
    const rawValue = await SecureStore.getItemAsync(SESSION_TOKENS_KEY, SECURE_STORE_OPTIONS);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as SessionTokens;
    } catch {
      await SecureStore.deleteItemAsync(SESSION_TOKENS_KEY, SECURE_STORE_OPTIONS);
      return null;
    }
  },

  async getAccessToken() {
    return (await this.getTokens())?.accessToken ?? null;
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
    await SecureStore.deleteItemAsync(SESSION_TOKENS_KEY, SECURE_STORE_OPTIONS);
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
      this.getTokens(),
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
    } catch {
      await AsyncStorage.removeItem(SESSION_METADATA_KEY);
      return null;
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
      const store = useSessionStore.getState();
      const shouldNotify = store.connectionState !== 'unauthorized';

      await this.clearSession();
      useSessionStore.getState().setUnauthorized(reason);

      if (shouldNotify) {
        Alert.alert(SESSION_EXPIRED_TITLE, SESSION_EXPIRED_MESSAGE);
      }
    })().finally(() => {
      expiringSessionPromise = null;
    });

    return expiringSessionPromise;
  },

  async logout() {
    await this.clearSession();
  },

  async bootstrapSession(input: SessionBootstrapInput): Promise<Session | null> {
    const tokens = await this.getTokens();
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
};
