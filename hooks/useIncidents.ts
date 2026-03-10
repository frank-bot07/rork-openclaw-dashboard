import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapIncident } from '@/lib/openclaw/mappers';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import type { IncidentsQuery } from '@/types/openclaw';

type IncidentFilters = Pick<IncidentsQuery, 'severity' | 'status'>;

export function useIncidents(client: OpenClawClient | null, filters?: IncidentFilters) {
  const queryClient = useQueryClient();
  const initialIncidents = client?.hasSnapshot() ? client.peekIncidents(filters) : null;

  useEffect(() => {
    if (!client) {
      return;
    }

    const syncIncidents = () => {
      const raw = client.peekIncidents(filters);
      queryClient.setQueryData(
        queryKeys.incidents.list(filters),
        raw.items.map(mapIncident)
      );
    };

    syncIncidents();

    const unsubscribePush = client.subscribeToPushEvents((event) => {
      if (event.event === 'cron' || event.event === 'agent') {
        syncIncidents();
      }
    });
    const unsubscribeConnection = client.subscribeToConnectionState((state) => {
      if (state === 'connected') {
        syncIncidents();
      }
    });

    return () => {
      unsubscribePush();
      unsubscribeConnection();
    };
  }, [client, filters, queryClient]);

  return useQuery({
    queryKey: queryKeys.incidents.list(filters),
    queryFn: async () => {
      if (!client) {
        throw new Error('No client');
      }

      const raw = client.hasSnapshot() ? client.peekIncidents(filters) : await client.getIncidents(filters);
      return raw.items.map(mapIncident);
    },
    initialData: initialIncidents ? initialIncidents.items.map(mapIncident) : undefined,
    enabled: !!client,
    gcTime: 5 * 60 * 1000,
    staleTime: Infinity,
    retry: 1,
  });
}
