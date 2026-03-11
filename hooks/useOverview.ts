import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapGatewayOverview } from '@/lib/openclaw/mappers';
import { queryKeys } from '@/lib/openclaw/queryKeys';

export function useOverview(client: OpenClawClient | null) {
  const queryClient = useQueryClient();
  const initialOverview = client?.hasSnapshot() ? client.peekOverview() : null;

  useEffect(() => {
    if (!client) {
      return;
    }

    const syncOverview = () => {
      const overview = client.peekOverview();

      if (!overview) {
        return;
      }

      queryClient.setQueryData(queryKeys.overview, mapGatewayOverview(overview));
    };

    syncOverview();

    const unsubscribePush = client.subscribeToPushEvents((event) => {
      if (event.event === 'presence' || event.event === 'agent' || event.event === 'cron' || event.event === 'chat') {
        syncOverview();
      }
    });
    const unsubscribeConnection = client.subscribeToConnectionState((state) => {
      if (state === 'connected') {
        syncOverview();
      }
    });

    return () => {
      unsubscribePush();
      unsubscribeConnection();
    };
  }, [client, queryClient]);

  return useQuery({
    queryKey: queryKeys.overview,
    queryFn: async () => {
      if (!client) {
        throw new Error('No client');
      }

      const raw = await client.getOverview();
      return mapGatewayOverview(raw);
    },
    initialData: initialOverview ? mapGatewayOverview(initialOverview) : undefined,
    enabled: !!client,
    gcTime: 5 * 60 * 1000,
    staleTime: Infinity,
    retry: 1,
  });
}
