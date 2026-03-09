import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { ConnectionState, GatewayCapabilities, Session } from '@/types/openclaw';

const SESSION_TOKENS_KEY = 'openclaw.session.tokens';
const SESSION_METADATA_KEY = 'openclaw.session.metadata';
const LAST_GATEWAY_URL_KEY = 'openclaw.gateway-url';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'openclaw.mobile',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

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
  issuedAt?: string | null;
  lastValidatedAt?: string | null;
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
    await Promise.all([
      AsyncStorage.setItem(
        SESSION_METADATA_KEY,
        JSON.stringify({
          ...session,
          capabilities: {
            ...DEFAULT_GATEWAY_CAPABILITIES,
            ...session.capabilities,
          },
        })
      ),
      this.saveGatewayUrl(session.gatewayUrl),
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
        accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? parsed.accessTokenExpiresAt ?? null,
        refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? parsed.refreshTokenExpiresAt ?? null,
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
      accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
      metadata: input.metadata,
      lastValidatedAt: input.lastValidatedAt ?? null,
      issuedAt: input.issuedAt ?? null,
    };
  },
};
