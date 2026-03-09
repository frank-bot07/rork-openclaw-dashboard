import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { useAgents } from '@/hooks/useAgents';
import { createStoredSessionClient, OpenClawClient } from '@/lib/openclaw/client';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { mockCronJobs, mockHeartbeats } from '@/mocks/scheduler';
import { useSessionStore } from '@/stores/sessionStore';
import type { Agent, CronJob, HeartbeatEntry } from '@/types/openclaw';

interface OpenClawContextValue {
  client: OpenClawClient | null;
  agents: Agent[];
  cronJobs: CronJob[];
  heartbeats: HeartbeatEntry[];
  isRefreshing: boolean;
  refreshData: () => Promise<void>;
  toggleCronJob: (jobId: string) => void;
  addCronJob: (job: CronJob) => void;
  deleteCronJob: (jobId: string) => void;
}

export const [OpenClawProvider, useOpenClaw] = createContextHook<OpenClawContextValue>(() => {
  const queryClient = useQueryClient();
  const gatewayUrl = useSessionStore((state) => state.gatewayUrl ?? state.session?.gatewayUrl ?? null);
  const [cronJobs, setCronJobs] = useState(mockCronJobs);
  const [heartbeats, setHeartbeats] = useState(mockHeartbeats);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const client = useMemo(
    () => (gatewayUrl ? createStoredSessionClient({ baseUrl: gatewayUrl }) : null),
    [gatewayUrl]
  );
  const agentsQuery = useAgents(client);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);

    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all }),
      agentsQuery.refetch(),
    ]);

    setHeartbeats((current) =>
      current.map((heartbeat) => ({
        ...heartbeat,
        lastPing: new Date().toISOString(),
        latencyMs:
          heartbeat.status === 'down' ? 0 : Math.max(8, heartbeat.latencyMs + Math.round(Math.random() * 12) - 6),
      }))
    );
    setIsRefreshing(false);
  }, [agentsQuery, queryClient]);

  const toggleCronJob = useCallback((jobId: string) => {
    setCronJobs((current) =>
      current.map((job) => (job.id === jobId ? { ...job, enabled: !job.enabled } : job))
    );
  }, []);

  const addCronJob = useCallback((job: CronJob) => {
    setCronJobs((current) => [...current, job]);
  }, []);

  const deleteCronJob = useCallback((jobId: string) => {
    setCronJobs((current) => current.filter((job) => job.id !== jobId));
  }, []);

  return {
    client,
    agents: agentsQuery.data ?? [],
    cronJobs,
    heartbeats,
    isRefreshing: isRefreshing || agentsQuery.isRefetching,
    refreshData,
    toggleCronJob,
    addCronJob,
    deleteCronJob,
  };
});

export function useOpenClawClient() {
  return useOpenClaw().client;
}
