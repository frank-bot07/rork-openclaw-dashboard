import { Platform } from 'react-native';
import { openClawAuth } from '@/lib/openclaw/auth';
import type { GatewayOverviewResponse } from '@/types/openclaw';
import {
  OpenClawClientError,
  type OpenClawClientRuntimeState,
  type OpenClawRpcResponseMessage,
} from '@/lib/openclaw/client-types';
import {
  DEFAULT_CAPS,
  DEFAULT_SCOPES,
  DEFAULT_TIMEOUT_MS,
  SUPPORTED_PROTOCOL_VERSION,
} from '@/lib/openclaw/client-types';
import type { OpenClawClientDataStore } from '@/lib/openclaw/client-data';
import { normalizeHelloPayload } from '@/lib/openclaw/client-data';
import type { OpenClawClientEvents } from '@/lib/openclaw/client-events';
import type { OpenClawClientRpc } from '@/lib/openclaw/client-rpc';
import {
  createId,
  isAuthError,
  normalizeError,
  parseSocketMessage,
  resolveAuthToken,
  resolveSocketCloseCode,
  rpcResponseToError,
  toWebSocketUrl,
} from '@/lib/openclaw/client-utils';

export interface OpenClawClientWebSocketConfig {
  state: OpenClawClientRuntimeState;
  data: OpenClawClientDataStore;
  events: OpenClawClientEvents;
  rpc: OpenClawClientRpc;
}

export class OpenClawClientWebSocket {
  constructor(private readonly config: OpenClawClientWebSocketConfig) {}

  async connect() {
    const existingOverview = this.config.data.peekOverview();
    if (existingOverview && this.config.state.connectionState === 'connected') {
      return existingOverview;
    }

    if (this.config.state.connectPromise) {
      return this.config.state.connectPromise;
    }

    const WebSocketImpl = this.getWebSocketImpl();
    if (!WebSocketImpl) {
      throw new OpenClawClientError('WebSocket is unavailable in this environment.', {
        code: 'WS_UNAVAILABLE',
      });
    }

    this.config.state.manuallyClosed = false;
    this.clearReconnectTimer();

    this.config.state.connectPromise = new Promise<GatewayOverviewResponse>((resolve, reject) => {
      this.config.state.connectPromiseResolve = resolve;
      this.config.state.connectPromiseReject = reject;

      try {
        const socket = new WebSocketImpl(toWebSocketUrl(this.config.state.config.baseUrl));
        this.config.state.socket = socket;
        this.setConnectionState(
          this.config.state.hasConnectedAtLeastOnce ? 'reconnecting' : 'connecting'
        );

        socket.onopen = () => {
          this.armHandshakeTimeout('Timed out waiting for gateway auth challenge.');
        };

        socket.onmessage = (message) => {
          void this.handleSocketMessage(message.data);
        };

        socket.onerror = () => {
          if (!this.config.state.lastConnectionError) {
            this.config.state.lastConnectionError = new OpenClawClientError(
              'WebSocket connection failed.',
              {
                code: 'WS_ERROR',
              }
            );
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

    return this.config.state.connectPromise;
  }

  disconnect(reason = 'Client closed connection.') {
    this.config.state.manuallyClosed = true;
    this.clearReconnectTimer();
    this.clearHandshakeTimeout();
    this.config.state.handshakeRequestId = null;
    this.config.rpc.rejectAllPendingRequests(
      new OpenClawClientError(reason, {
        code: 'WS_CLOSED',
      })
    );

    if (this.config.state.socket) {
      const socket = this.config.state.socket;
      this.config.state.socket = null;

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

      this.config.events.applyPushEvent(message);
      this.config.events.emitPushEvent(message);
      return;
    }

    this.handleResponse(message);
  }

  private async handleConnectChallenge() {
    const socket = this.config.state.socket;
    if (!socket || socket.readyState !== socket.OPEN || this.config.state.handshakeRequestId) {
      return;
    }

    try {
      const authToken = await resolveAuthToken(this.config.state.config);

      if (!authToken) {
        throw new OpenClawClientError('Operator token is required.', {
          code: 'AUTH_TOKEN_MISSING',
        });
      }

      const requestId = createId();
      this.config.state.handshakeRequestId = requestId;
      this.armHandshakeTimeout('Timed out waiting for gateway hello response.');
      socket.send(
        JSON.stringify({
          type: 'req',
          id: requestId,
          method: 'connect',
          params: {
            minProtocol: SUPPORTED_PROTOCOL_VERSION,
            maxProtocol: SUPPORTED_PROTOCOL_VERSION,
            client: {
              id: 'openclaw-ios',
              version: this.config.state.config.clientVersion ?? '1.0.0',
              platform: Platform.OS,
              mode: 'ui',
              instanceId: this.config.state.instanceId,
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
      this.config.state.lastConnectionError = normalized;
      if (isAuthError(normalized.code)) {
        await openClawAuth.expireSession(normalized.message);
      }
      this.rejectConnectPromise(normalized);
      this.config.state.socket?.close();
    }
  }

  private handleResponse(message: OpenClawRpcResponseMessage) {
    if (message.id === this.config.state.handshakeRequestId) {
      this.clearHandshakeTimeout();
      this.config.state.handshakeRequestId = null;

      if (!message.ok) {
        const error = rpcResponseToError(message, 'Gateway authentication failed.');
        this.config.state.lastConnectionError = error;
        this.rejectConnectPromise(error);

        if (isAuthError(error.code)) {
          void openClawAuth.expireSession(error.message);
        }

        this.config.state.socket?.close();
        return;
      }

      const overview = normalizeHelloPayload(
        message.payload,
        this.config.state.config.baseUrl
      );
      this.config.data.replaceOverviewSnapshot(overview);
      this.config.state.lastConnectionError = null;
      this.config.state.reconnectAttempt = 0;
      this.config.state.hasConnectedAtLeastOnce = true;
      this.setConnectionState('connected');
      void this.config.data
        .bootstrapGatewayData()
        .catch((error) => {
          const normalized = normalizeError(error, 'Failed to load gateway data.');
          console.error('[OpenClaw] Failed to bootstrap gateway data.', normalized);
        })
        .finally(() => {
          this.resolveConnectPromise(this.config.data.peekOverview() ?? overview);
        });
      return;
    }

    this.config.rpc.handleResponse(message);
  }

  private handleSocketClose(event: CloseEvent) {
    const error =
      this.config.state.lastConnectionError ??
      new OpenClawClientError(event.reason || 'Gateway connection closed.', {
        code: resolveSocketCloseCode(event.code),
      });

    this.config.state.socket = null;
    this.config.state.handshakeRequestId = null;
    this.clearHandshakeTimeout();
    this.config.rpc.rejectAllPendingRequests(error);

    if (this.config.state.connectionState !== 'connected') {
      this.rejectConnectPromise(error);
    }

    if (this.config.state.manuallyClosed) {
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
    if (!this.config.state.reconnectConfig.enabled || this.config.state.manuallyClosed) {
      this.setConnectionState('disconnected', error);
      return;
    }

    this.clearReconnectTimer();
    this.config.state.reconnectAttempt += 1;
    const delayMs = Math.min(
      this.config.state.reconnectConfig.baseDelayMs *
        2 ** Math.max(this.config.state.reconnectAttempt - 1, 0),
      this.config.state.reconnectConfig.maxDelayMs
    );
    this.setConnectionState('reconnecting', error);

    this.config.state.reconnectTimeoutId = setTimeout(() => {
      this.config.state.reconnectTimeoutId = null;
      void this.connect().catch((nextError) => {
        const normalized = normalizeError(nextError, 'Gateway reconnect attempt failed.');
        this.config.state.lastConnectionError = normalized;
        this.scheduleReconnect(normalized);
      });
    }, delayMs);
  }

  private setConnectionState(
    state: OpenClawClientRuntimeState['connectionState'],
    error: OpenClawClientError | null = null
  ) {
    this.config.state.connectionState = state;
    this.config.state.lastConnectionError = error;
    this.config.data.handleConnectionStateChange();
    this.config.events.notifyConnectionState(state, error);
  }

  private resolveConnectPromise(overview: GatewayOverviewResponse) {
    const resolve = this.config.state.connectPromiseResolve;
    this.config.state.connectPromise = null;
    this.config.state.connectPromiseResolve = null;
    this.config.state.connectPromiseReject = null;

    resolve?.(overview);
  }

  private rejectConnectPromise(error: OpenClawClientError) {
    const reject = this.config.state.connectPromiseReject;
    this.config.state.connectPromise = null;
    this.config.state.connectPromiseResolve = null;
    this.config.state.connectPromiseReject = null;
    reject?.(error);
  }

  private armHandshakeTimeout(message: string) {
    this.clearHandshakeTimeout();
    this.config.state.handshakeTimeoutId = setTimeout(() => {
      const error = new OpenClawClientError(message, {
        code: 'REQUEST_TIMEOUT',
      });
      this.config.state.lastConnectionError = error;
      this.rejectConnectPromise(error);
      this.config.state.socket?.close();
    }, this.config.state.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }

  private clearHandshakeTimeout() {
    if (this.config.state.handshakeTimeoutId) {
      clearTimeout(this.config.state.handshakeTimeoutId);
      this.config.state.handshakeTimeoutId = null;
    }
  }

  private clearReconnectTimer() {
    if (this.config.state.reconnectTimeoutId) {
      clearTimeout(this.config.state.reconnectTimeoutId);
      this.config.state.reconnectTimeoutId = null;
    }
  }

  private getWebSocketImpl() {
    return this.config.state.config.WebSocketImpl ?? globalThis.WebSocket;
  }
}
