/**
 * Hook: fetch conversation history + send message mutation.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/openclaw/queryKeys';
import { OpenClawClient } from '@/lib/openclaw/client';
import { mapConversation } from '@/lib/openclaw/mappers';
import { useSessionStore } from '@/stores/sessionStore';

export function useConversation(client: OpenClawClient | null, agentId: string | undefined) {
  const connectionState = useSessionStore((s) => s.connectionState);

  const query = useQuery({
    queryKey: queryKeys.conversations.byAgent(agentId ?? ''),
    queryFn: async () => {
      if (!client || !agentId) throw new Error('No client or agent id');
      const raw = await client.getConversation({ agentId });
      return mapConversation(raw);
    },
    enabled: !!client && !!agentId && connectionState === 'connected',
    staleTime: 5_000,
    retry: 2,
  });

  return query;
}

export function useSendMessage(client: OpenClawClient | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, content }: { agentId: string; content: string }) => {
      if (!client) throw new Error('No client');
      return client.sendMessage({ agentId, content });
    },
    onSuccess: (_data, variables) => {
      // Invalidate conversation cache to pick up new messages
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.byAgent(variables.agentId),
      });
    },
  });
}
