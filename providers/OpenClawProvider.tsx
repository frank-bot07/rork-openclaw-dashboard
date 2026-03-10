import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { useAgents } from '@/hooks/useAgents';
import { createStoredSessionClient, OpenClawClient } from '@/lib/openclaw/client';
import { queryKeys } from '@/lib/openclaw/queryKeys';
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const client = useMemo(
    () => (gatewayUrl ? createStoredSessionClient({ baseUrl: gatewayUrl }) : null),
    [gatewayUrl]
  );
  const agentsQuery = useAgents(client);

  const heartbeats = useMemo<HeartbeatEntry[]>(() => {
    const gatewayHeartbeat: HeartbeatEntry = {
      id: 'gateway-core',
      targetId: 'gateway',
      targetName: 'Gateway Core',
      targetType: 'gateway',
      status:
        connectionState === 'connected'
          ? 'healthy'
          : connectionState === 'reconnecting'
            ? 'degraded'
            : connectionState === 'offline' || connectionState === 'unauthorized'
              ? 'down'
              : 'degraded',
      latencyMs: connectionState === 'connected' ? 24 : 0,
      lastPing: new Date().toISOString(),
      uptimePercent: connectionState === 'connected' ? 99.9 : 0,
    };

    const agentHeartbeats = (agentsQuery.data ?? []).map((agent) => ({
      id: `hb-${agent.id}`,
      targetId: agent.id,
      targetName: agent.name,
      targetType: 'agent' as const,
      status:
        agent.status === 'online'
          ? 'healthy'
          : agent.status === 'degraded'
            ? 'degraded'
            : 'down',
      latencyMs: agent.status === 'online' ? 32 : 0,
      lastPing: new Date().toISOString(),
      uptimePercent: agent.status === 'online' ? 99.2 : agent.status === 'degraded' ? 92.4 : 0,
    }));

    return [gatewayHeartbeat, ...agentHeartbeats];
  }, [agentsQuery.data, connectionState]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);

    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.incidents.all }),
      agentsQuery.refetch(),
    ]);

    setIsRefreshing(false);
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
