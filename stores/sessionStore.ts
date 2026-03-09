/**
 * Zustand store for connection/session state.
 * Manages gateway URL, connection lifecycle, and session metadata.
 */
import { create } from 'zustand';
import type { ConnectionState, Session } from '@/types/openclaw';

interface SessionState {
  connectionState: ConnectionState;
  gatewayUrl: string | null;
  session: Session | null;
  lastError: string | null;

  // Actions
  setConnecting: (url: string) => void;
  setConnected: (session: Session) => void;
  setReconnecting: (reason?: string) => void;
  setDisconnected: (error?: string) => void;
  setUnauthorized: (reason?: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  connectionState: 'disconnected',
  gatewayUrl: null,
  session: null,
  lastError: null,

  setConnecting: (url: string) =>
    set({ connectionState: 'connecting', gatewayUrl: url, lastError: null }),

  setConnected: (session: Session) =>
    set({ connectionState: 'connected', session, lastError: null }),

  setReconnecting: (reason?: string) =>
    set({ connectionState: 'reconnecting', lastError: reason ?? null }),

  setDisconnected: (error?: string) =>
    set({ connectionState: 'disconnected', session: null, lastError: error ?? null }),

  setUnauthorized: (reason?: string) =>
    set({ connectionState: 'unauthorized', session: null, lastError: reason ?? 'Unauthorized' }),

  clearSession: () =>
    set({ connectionState: 'disconnected', gatewayUrl: null, session: null, lastError: null }),
}));
