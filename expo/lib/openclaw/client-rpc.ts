import {
  OpenClawClientError,
  type PendingRequest,
  type OpenClawRpcResponseMessage,
  type RequestOptions,
} from '@/lib/openclaw/client-types';
import type { GatewayOverviewResponse } from '@/types/openclaw';
import { createId, isAuthError, normalizeError, rpcResponseToError } from '@/lib/openclaw/client-utils';

export interface OpenClawClientRpcConfig {
  getSocket: () => WebSocket | null;
  getTimeoutMs: () => number;
  onAuthError?: (error: OpenClawClientError) => void;
}

export class OpenClawClientRpc {
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(private readonly config: OpenClawClientRpcConfig) {}

  async request(
    connect: () => Promise<GatewayOverviewResponse>,
    method: string,
    params: Record<string, unknown>,
    options: RequestOptions = {}
  ) {
    await connect();
    return this.sendRequest(method, params, options);
  }

  async sendRequest(
    method: string,
    params: Record<string, unknown>,
    options: RequestOptions = {}
  ) {
    const socket = this.config.getSocket();
    if (!socket || socket.readyState !== socket.OPEN) {
      throw new OpenClawClientError('Gateway connection is not ready.', {
        code: 'WS_NOT_CONNECTED',
      });
    }

    if (options.signal?.aborted) {
      throw new OpenClawClientError('Request aborted.', {
        code: 'AbortError',
      });
    }

    const id = createId();
    const timeoutMs = options.timeoutMs ?? this.config.getTimeoutMs();

    return new Promise<unknown>((resolve, reject) => {
      const abortListener = () => {
        this.clearPendingRequest(id);
        reject(
          new OpenClawClientError('Request aborted.', {
            code: 'AbortError',
          })
        );
      };

      const timeoutId = setTimeout(() => {
        this.clearPendingRequest(id);
        reject(
          new OpenClawClientError(`Request timed out after ${timeoutMs}ms.`, {
            code: 'REQUEST_TIMEOUT',
          })
        );
      }, timeoutMs);

      if (options.signal) {
        options.signal.addEventListener('abort', abortListener, { once: true });
      }

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeoutId,
        abortCleanup: options.signal
          ? () => options.signal?.removeEventListener('abort', abortListener)
          : undefined,
      });

      try {
        socket.send(
          JSON.stringify({
            type: 'req',
            id,
            method,
            params,
          })
        );
      } catch (error) {
        this.clearPendingRequest(id);
        reject(normalizeError(error, `Failed to send ${method} request.`));
      }
    });
  }

  handleResponse(message: OpenClawRpcResponseMessage) {
    const pending = this.pendingRequests.get(message.id);
    if (!pending) {
      return false;
    }

    this.clearPendingRequest(message.id);

    if (!message.ok) {
      const error = rpcResponseToError(message, 'Gateway request failed.');

      if (isAuthError(error.code)) {
        this.config.onAuthError?.(error);
      }

      pending.reject(error);
      return true;
    }

    pending.resolve(message.payload);
    return true;
  }

  rejectAllPendingRequests(error: OpenClawClientError) {
    for (const [id, pending] of this.pendingRequests.entries()) {
      this.clearPendingRequest(id);
      pending.reject(error);
    }
  }

  private clearPendingRequest(id: string) {
    const pending = this.pendingRequests.get(id);

    if (!pending) {
      return;
    }

    clearTimeout(pending.timeoutId);
    pending.abortCleanup?.();
    this.pendingRequests.delete(id);
  }
}
