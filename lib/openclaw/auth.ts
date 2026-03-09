import * as SecureStore from 'expo-secure-store';
import type { ConnectionState, GatewayCapabilities, Session } from '@/types/openclaw';

const SESSION_TOKENS_KEY = 'openclaw.session.tokens';
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: 'openclaw.mobile',
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const DEFAULT_CAPABILITIES: GatewayCapabilities = {
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

  async clearTokens() {
    await SecureStore.deleteItemAsync(SESSION_TOKENS_KEY, SECURE_STORE_OPTIONS);
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
        ...DEFAULT_CAPABILITIES,
        ...input.capabilities,
      },
      accessTokenExpiresAt: tokens.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt ?? null,
      metadata: input.metadata,
      lastValidatedAt: null,
      issuedAt: null,
    };
  },
};
