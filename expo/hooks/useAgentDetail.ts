import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapAgentDetail } from '@/lib/openclaw/mappers';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { safeInvalidateMany } from '@/lib/openclaw/queryUtils';

export function useAgentDetail(client: OpenClawClient | null, agentId: string | undefined) {
  const queryClient = useQueryClient();
  const initialAgent = agentId && client?.hasSnapshot() ? client.peekAgent(agentId) : null;

  useEffect(() => {
    if (!client || !agentId) {
      return;
    }

    const syncAgentDetail = async () => {
      try {
        const raw = await client.getAgent(agentId);
        queryClient.setQueryData(queryKeys.agents.detail(agentId), mapAgentDetail(raw));
      } catch (error) {
        if (error instanceof Error) {
          console.error('[AgentDetail] Failed to sync agent detail cache.', error);
        }
      }
    };

    void syncAgentDetail();

    const unsubscribePush = client.subscribeToPushEvents((event) => {
      if (event.event === 'presence' || event.event === 'agent' || event.event === 'cron' || event.event === 'chat') {
        void syncAgentDetail();
      }
    });
    const unsubscribeConnection = client.subscribeToConnectionState((state) => {
      if (state === 'connected') {
        void syncAgentDetail();
      }
    });

    return () => {
      unsubscribePush();
      unsubscribeConnection();
    };
  }, [agentId, client, queryClient]);

  return useQuery({
    queryKey: queryKeys.agents.detail(agentId ?? ''),
    queryFn: async () => {
      if (!client || !agentId) throw new Error('No client or agent id');
      const raw = await client.getAgent(agentId);
      return mapAgentDetail(raw);
    },
    initialData:
      initialAgent && agentId
        ? mapAgentDetail({
            ...initialAgent,
            recentRuns: client?.peekRuns({ agentId }).items ?? [],
            incidents: client?.peekIncidents({ agentId }).items ?? [],
            systemPrompt: '',
          })
        : undefined,
    enabled: !!client && !!agentId,
    gcTime: 10 * 60 * 1000,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useRestartAgent(client: OpenClawClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string) => {
      if (!client) throw new Error('No client');
      return client.restartAgent(agentId);
    },
    onSuccess: async (_data, agentId) => {
      await safeInvalidateMany(queryClient, [
        { queryKey: queryKeys.agents.all, label: 'agents' },
        { queryKey: queryKeys.agents.detail(agentId), label: `agent:${agentId}` },
        { queryKey: queryKeys.overview, label: 'overview' },
      ]);
    },
  });
}

export function usePingAgent(client: OpenClawClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agentId: string) => {
      if (!client) throw new Error('No client');
      return client.pingAgent(agentId);
    },
    onSuccess: async (_data, agentId) => {
      await safeInvalidateMany(queryClient, [
        { queryKey: queryKeys.agents.detail(agentId), label: `agent:${agentId}` },
        { queryKey: queryKeys.overview, label: 'overview' },
      ]);
    },
  });
}
