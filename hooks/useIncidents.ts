/**
 * Hook: fetch open/recent incidents.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapIncident } from '@/lib/openclaw/mappers';
import { useSessionStore } from '@/stores/sessionStore';
import type { IncidentsQuery } from '@/types/openclaw';

type IncidentFilters = Pick<IncidentsQuery, 'severity' | 'status'>;

export function useIncidents(client: OpenClawClient | null, filters?: IncidentFilters) {
  const connectionState = useSessionStore((s) => s.connectionState);

  return useQuery({
    queryKey: queryKeys.incidents.list(filters),
    queryFn: async () => {
      if (!client) throw new Error('No client');
      const raw = await client.getIncidents(filters);
      return raw.items.map(mapIncident);
    },
    enabled: !!client && connectionState === 'connected',
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
