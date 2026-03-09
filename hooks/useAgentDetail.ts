/**
 * Hook: fetch detailed agent info (status, runs, allowed actions).
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/openclaw/queryKeys';
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
