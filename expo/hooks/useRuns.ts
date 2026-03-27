import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapRunSummary } from '@/lib/openclaw/mappers';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { safeInvalidateMany } from '@/lib/openclaw/queryUtils';
import type { RunsQuery } from '@/types/openclaw';

type RunFilters = Pick<RunsQuery, 'status' | 'agentId'>;

export function useRuns(client: OpenClawClient | null, filters?: RunFilters) {
  const queryClient = useQueryClient();
  const initialRuns = client?.hasSnapshot() ? client.peekRuns(filters) : null;

  useEffect(() => {
    if (!client) {
      return;
    }

    const syncRuns = () => {
      const raw = client.peekRuns(filters);
      queryClient.setQueryData(
        queryKeys.runs.list(filters),
        raw.items.map(mapRunSummary)
      );
    };

    syncRuns();

    const unsubscribePush = client.subscribeToPushEvents((event) => {
      if (event.event === 'cron' || event.event === 'chat' || event.event === 'agent') {
        syncRuns();
      }
    });
    const unsubscribeConnection = client.subscribeToConnectionState((state) => {
      if (state === 'connected') {
        syncRuns();
      }
    });

    return () => {
      unsubscribePush();
      unsubscribeConnection();
    };
  }, [client, filters, queryClient]);

  return useQuery({
    queryKey: queryKeys.runs.list(filters),
    queryFn: async () => {
      if (!client) {
        throw new Error('No client');
      }

      const raw = await client.getRuns(filters);
      return raw.items.map(mapRunSummary);
    },
    initialData: initialRuns ? initialRuns.items.map(mapRunSummary) : undefined,
    enabled: !!client,
    gcTime: 5 * 60 * 1000,
    staleTime: Infinity,
    retry: 1,
  });
}

export function useRetryRun(client: OpenClawClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (runId: string) => {
      if (!client) throw new Error('No client');
      return client.retryRun(runId);
    },
    onSuccess: async () => {
      await safeInvalidateMany(queryClient, [
        { queryKey: queryKeys.runs.all, label: 'runs' },
        { queryKey: queryKeys.overview, label: 'overview' },
      ]);
    },
  });
}
