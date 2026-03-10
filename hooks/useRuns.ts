/**
 * Hook: fetch runs (active, failed, recent) + retry mutation.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { safeInvalidateMany } from '@/lib/openclaw/queryUtils';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapRunSummary } from '@/lib/openclaw/mappers';
import { useSessionStore } from '@/stores/sessionStore';
import type { RunsQuery } from '@/types/openclaw';

type RunFilters = Pick<RunsQuery, 'status' | 'agentId'>;

export function useRuns(client: OpenClawClient | null, filters?: RunFilters) {
  const connectionState = useSessionStore((s) => s.connectionState);

  return useQuery({
    queryKey: queryKeys.runs.list(filters),
    queryFn: async () => {
      if (!client) throw new Error('No client');
      const raw = await client.getRuns(filters);
      return raw.items.map(mapRunSummary);
    },
    enabled: !!client && connectionState === 'connected',
    gcTime: 5 * 60 * 1000,
    staleTime: 10_000,
    refetchInterval: 30_000,
    retry: 2,
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
