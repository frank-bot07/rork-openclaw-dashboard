/**
 * Centralized React Query key factory.
 * Ensures consistent cache keys across all hooks and mutations.
 */

export const queryKeys = {
  session: ['session'] as const,

  overview: ['overview'] as const,

  agents: {
    all: ['agents'] as const,
    list: (filters?: { status?: string | string[]; search?: string }) =>
      ['agents', 'list', filters] as const,
    detail: (id: string) => ['agents', 'detail', id] as const,
  },

  conversations: {
    all: ['conversations'] as const,
    byAgent: (agentId: string) => ['conversations', agentId] as const,
    byThread: (agentId: string, threadId: string) =>
      ['conversations', agentId, threadId] as const,
  },

  runs: {
    all: ['runs'] as const,
    list: (filters?: { status?: string | string[]; agentId?: string }) =>
      ['runs', 'list', filters] as const,
    detail: (id: string) => ['runs', 'detail', id] as const,
  },

  incidents: {
    all: ['incidents'] as const,
    list: (filters?: { severity?: string | string[]; status?: string | string[] }) =>
      ['incidents', 'list', filters] as const,
    detail: (id: string) => ['incidents', 'detail', id] as const,
  },
} as const;
