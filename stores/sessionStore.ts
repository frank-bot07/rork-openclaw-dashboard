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
  restoreSession: (session: Session) => void;
  setConnectionState: (state: ConnectionState, reason?: string) => void;
  setConnecting: (url: string) => void;
  setConnected: (session: Session) => void;
  setReconnecting: (reason?: string) => void;
  setOffline: (reason?: string) => void;
  setDisconnected: (error?: string) => void;
  setUnauthorized: (reason?: string) => void;
  clearSession: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  connectionState: 'disconnected',
  gatewayUrl: null,
  session: null,
  lastError: null,

  restoreSession: (session: Session) =>
    set({
      connectionState: session.connectionState ?? 'connected',
      gatewayUrl: session.gatewayUrl,
      session,
      lastError: null,
    }),

  setConnectionState: (connectionState: ConnectionState, reason?: string) =>
    set((state) => ({
      connectionState,
      gatewayUrl: state.gatewayUrl ?? state.session?.gatewayUrl ?? null,
      session: state.session
        ? { ...state.session, connectionState }
        : state.session,
      lastError: reason ?? null,
    })),

  setConnecting: (url: string) =>
    set({ connectionState: 'connecting', gatewayUrl: url, lastError: null }),

  setConnected: (session: Session) =>
    set({
      connectionState: 'connected',
      gatewayUrl: session.gatewayUrl,
      session: { ...session, connectionState: 'connected' },
      lastError: null,
    }),

  setReconnecting: (reason?: string) =>
    set((state) => ({
      connectionState: 'reconnecting',
      gatewayUrl: state.gatewayUrl ?? state.session?.gatewayUrl ?? null,
      session: state.session
        ? { ...state.session, connectionState: 'reconnecting' }
        : state.session,
      lastError: reason ?? null,
    })),

  setOffline: (reason?: string) =>
    set((state) => ({
      connectionState: 'offline',
      gatewayUrl: state.gatewayUrl ?? state.session?.gatewayUrl ?? null,
      session: state.session
        ? { ...state.session, connectionState: 'offline' }
        : state.session,
      lastError: reason ?? null,
    })),

  setDisconnected: (error?: string) =>
    set((state) => ({
      connectionState: 'disconnected',
      gatewayUrl: state.gatewayUrl ?? state.session?.gatewayUrl ?? null,
      session: state.session
        ? { ...state.session, connectionState: 'disconnected' }
        : state.session,
      lastError: error ?? null,
    })),

  setUnauthorized: (reason?: string) =>
    set((state) => ({
      connectionState: 'unauthorized',
      gatewayUrl: state.gatewayUrl ?? state.session?.gatewayUrl ?? null,
      session: null,
      lastError: reason ?? 'Unauthorized',
    })),

  clearSession: () =>
    set({ connectionState: 'disconnected', gatewayUrl: null, session: null, lastError: null }),
}));
