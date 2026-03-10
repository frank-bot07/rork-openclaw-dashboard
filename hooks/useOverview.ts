/**
 * Hook: fetch gateway overview (health, agents, runs, incidents).
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapGatewayOverview } from '@/lib/openclaw/mappers';
import { useSessionStore } from '@/stores/sessionStore';

export function useOverview(client: OpenClawClient | null) {
  const connectionState = useSessionStore((s) => s.connectionState);

  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: async () => {
      if (!client) throw new Error('No client');
      const raw = await client.getOverview();
      return mapGatewayOverview(raw);
    },
    enabled: !!client && connectionState === 'connected',
    gcTime: 5 * 60 * 1000,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 2,
  });
}
