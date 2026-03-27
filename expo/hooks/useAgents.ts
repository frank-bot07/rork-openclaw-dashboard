import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapAgentSummary } from '@/lib/openclaw/mappers';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import type { AgentStatus } from '@/types/openclaw';

interface AgentFilters {
  status?: AgentStatus | 'all';
  search?: string;
}

export function useAgents(client: OpenClawClient | null, filters?: AgentFilters) {
  const queryClient = useQueryClient();
  const queryFilters = useMemo(
    () => ({
      status: filters?.status !== 'all' ? filters?.status : undefined,
      search: filters?.search || undefined,
    }),
    [filters?.search, filters?.status]
  );
  const initialAgents = client?.hasSnapshot() ? client.peekAgents(queryFilters) : null;

  useEffect(() => {
    if (!client) {
      return;
    }

    const syncAgents = () => {
      const raw = client.peekAgents(queryFilters);
      queryClient.setQueryData(
        queryKeys.agents.list(queryFilters),
        raw.items.map(mapAgentSummary)
      );
    };

    syncAgents();

    const unsubscribePush = client.subscribeToPushEvents((event) => {
      if (event.event === 'presence' || event.event === 'agent' || event.event === 'chat' || event.event === 'cron') {
        syncAgents();
      }
    });
    const unsubscribeConnection = client.subscribeToConnectionState((state) => {
      if (state === 'connected') {
        syncAgents();
      }
    });

    return () => {
      unsubscribePush();
      unsubscribeConnection();
    };
  }, [client, queryClient, queryFilters]);

  return useQuery({
    queryKey: queryKeys.agents.list(queryFilters),
    queryFn: async () => {
      if (!client) {
        throw new Error('No client');
      }

      const raw = await client.getAgents(queryFilters);
      return raw.items.map(mapAgentSummary);
    },
    initialData: initialAgents ? initialAgents.items.map(mapAgentSummary) : undefined,
    enabled: !!client,
    gcTime: 5 * 60 * 1000,
    staleTime: Infinity,
    retry: 1,
  });
}
