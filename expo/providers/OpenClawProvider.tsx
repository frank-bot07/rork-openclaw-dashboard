import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { useAgents } from '@/hooks/useAgents';
import { openClawAuth } from '@/lib/openclaw/auth';
import { createStoredSessionClient, OpenClawClient } from '@/lib/openclaw/client';
import { buildSessionFromOverview, toConnectionErrorMessage } from '@/lib/openclaw/connection';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { safeInvalidateMany } from '@/lib/openclaw/queryUtils';
import { useSessionStore } from '@/stores/sessionStore';
import type { Agent, HeartbeatEntry } from '@/types/openclaw';

interface OpenClawContextValue {
  client: OpenClawClient | null;
  agents: Agent[];
  heartbeats: HeartbeatEntry[];
  isRefreshing: boolean;
  isAgentsLoading: boolean;
  agentsError: Error | null;
  refreshData: () => Promise<void>;
  retryAgents: () => Promise<void>;
}

export const [OpenClawProvider, useOpenClaw] = createContextHook<OpenClawContextValue>(() => {
  const queryClient = useQueryClient();
  const gatewayUrl = useSessionStore((state) => state.gatewayUrl ?? state.session?.gatewayUrl ?? null);
  const connectionState = useSessionStore((state) => state.connectionState);
  const session = useSessionStore((state) => state.session);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const client = useMemo(
    () => (gatewayUrl ? createStoredSessionClient({ baseUrl: gatewayUrl }) : null),
    [gatewayUrl]
  );
  const agentsQuery = useAgents(client);

  useEffect(() => {
    if (!client || !gatewayUrl) {
      return;
    }

    let isDisposed = false;
    let hasStarted = false;

    const syncSession = async () => {
      const overview = client.peekOverview() ?? (await client.getOverview());
      const nextSession = buildSessionFromOverview(
        overview,
        gatewayUrl,
        useSessionStore.getState().session
      );

      await openClawAuth.saveSession(nextSession);

      if (!isDisposed) {
        useSessionStore.getState().setConnected(nextSession);
      }
    };

    const unsubscribe = client.subscribeToConnectionState((state, error) => {
      if (isDisposed) {
        return;
      }

      if (!hasStarted && state === 'disconnected') {
        return;
      }

      const message = error ? toConnectionErrorMessage(error) : undefined;
      const store = useSessionStore.getState();

      switch (state) {
        case 'connecting':
          store.setConnecting(gatewayUrl);
          break;
        case 'connected':
          void syncSession();
          break;
        case 'reconnecting':
          store.setReconnecting(message);
          break;
        case 'unauthorized':
          store.setUnauthorized(message ?? 'Operator token was rejected by the gateway.');
          break;
        case 'disconnected':
          store.setDisconnected(message);
          break;
        case 'offline':
          store.setOffline(message);
          break;
        default:
          store.setConnectionState(state, message);
          break;
      }
    });

    hasStarted = true;
    void client.connect().catch((error) => {
      if (isDisposed) {
        return;
      }

      const message = toConnectionErrorMessage(error);
      const store = useSessionStore.getState();

      if (store.connectionState === 'unauthorized') {
        return;
      }

      if (client.hasSnapshot()) {
        store.setReconnecting(message);
      } else {
        store.setOffline(message);
      }
    });

    return () => {
      isDisposed = true;
      unsubscribe();
      client.disconnect('Provider disposed gateway connection.');
    };
  }, [client, gatewayUrl]);

  const heartbeats = useMemo<HeartbeatEntry[]>(() => {
    const overview = client?.peekOverview();
    const gatewayHeartbeat: HeartbeatEntry = {
      id: 'gateway-core',
      targetId: 'gateway',
      targetName: overview?.gateway.name ?? session?.gatewayName ?? 'Gateway',
      targetType: 'gateway',
      status:
        connectionState === 'connected'
          ? 'healthy'
          : connectionState === 'reconnecting' || connectionState === 'connecting'
            ? 'degraded'
            : 'down',
      latencyMs: readNumber(overview?.gateway.latencyMs) ?? 0,
      lastPing:
        readString(overview?.gateway.lastSyncAt) ??
        readString(session?.lastValidatedAt) ??
        readString(session?.connectedAt) ??
        new Date().toISOString(),
      uptimePercent:
        connectionState === 'connected' ? 100 : connectionState === 'reconnecting' ? 50 : 0,
    };

    const agentHeartbeats = (agentsQuery.data ?? []).map<HeartbeatEntry>((agent) => ({
      id: `hb-${agent.id}`,
      targetId: agent.id,
      targetName: agent.name,
      targetType: 'agent',
      status:
        agent.status === 'online'
          ? 'healthy'
          : agent.status === 'degraded'
            ? 'degraded'
            : 'down',
      latencyMs: readNumber(agent.metadata?.latencyMs) ?? 0,
      lastPing: readString(agent.metadata?.lastSeenAt) ?? new Date().toISOString(),
      uptimePercent:
        readNumber(agent.metadata?.uptimePercent) ??
        (agent.status === 'online' ? 100 : agent.status === 'degraded' ? 80 : 0),
    }));

    return [gatewayHeartbeat, ...agentHeartbeats];
  }, [agentsQuery.data, client, connectionState, session]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await Promise.allSettled([
        safeInvalidateMany(queryClient, [
          { queryKey: queryKeys.overview, label: 'overview' },
          { queryKey: queryKeys.agents.all, label: 'agents' },
          { queryKey: queryKeys.runs.all, label: 'runs' },
          { queryKey: queryKeys.incidents.all, label: 'incidents' },
        ]),
        agentsQuery.refetch(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [agentsQuery, queryClient]);

  const retryAgents = useCallback(async () => {
    await agentsQuery.refetch();
  }, [agentsQuery]);

  return {
    client,
    agents: agentsQuery.data ?? [],
    heartbeats,
    isRefreshing: isRefreshing || agentsQuery.isRefetching,
    isAgentsLoading: agentsQuery.isLoading,
    agentsError: agentsQuery.error instanceof Error ? agentsQuery.error : null,
    refreshData,
    retryAgents,
  };
});

export function useOpenClawClient() {
  return useOpenClaw().client;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : null;
}
