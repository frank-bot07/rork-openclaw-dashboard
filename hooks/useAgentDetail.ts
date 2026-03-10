/**
 * Hook: fetch detailed agent info (status, runs, allowed actions).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { safeInvalidateMany } from '@/lib/openclaw/queryUtils';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapAgentDetail } from '@/lib/openclaw/mappers';
import { useSessionStore } from '@/stores/sessionStore';

export function useAgentDetail(client: OpenClawClient | null, agentId: string | undefined) {
  const connectionState = useSessionStore((s) => s.connectionState);

  return useQuery({
    queryKey: queryKeys.agents.detail(agentId ?? ''),
    queryFn: async () => {
      if (!client || !agentId) throw new Error('No client or agent id');
      const raw = await client.getAgent(agentId);
      return mapAgentDetail(raw);
    },
    enabled: !!client && !!agentId && connectionState === 'connected',
    staleTime: 10_000,
    retry: 2,
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
