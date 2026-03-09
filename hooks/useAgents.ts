/**
 * Hook: fetch agent list with optional search/status filters.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapAgentSummary } from '@/lib/openclaw/mappers';
import { useSessionStore } from '@/stores/sessionStore';
import type { AgentStatus } from '@/types/openclaw';

interface AgentFilters {
  status?: AgentStatus | 'all';
  search?: string;
}

export function useAgents(client: OpenClawClient | null, filters?: AgentFilters) {
  const connectionState = useSessionStore((s) => s.connectionState);
  const queryFilters = {
    status: filters?.status !== 'all' ? filters?.status : undefined,
    search: filters?.search || undefined,
  };

  return useQuery({
    queryKey: queryKeys.agents.list(queryFilters),
    queryFn: async () => {
      if (!client) throw new Error('No client');
      const raw = await client.getAgents(queryFilters);
      return raw.items.map(mapAgentSummary);
    },
    enabled: !!client && connectionState === 'connected',
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 2,
  });
}
