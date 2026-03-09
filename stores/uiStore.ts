/**
 * Zustand store for ephemeral UI state.
 * Filters, drafts, expanded items — nothing persisted to server.
 */
import { create } from 'zustand';
import type { AgentStatus } from '@/types/openclaw';

interface UIState {
  // Agent list
  agentSearchQuery: string;
  agentStatusFilter: AgentStatus | 'all';

  // Runs list
  runsStatusFilter: string;
  runsSearchQuery: string;

  // Chat composer
  composerDrafts: Record<string, string>; // agentId → draft text

  // Expanded items
  expandedRunId: string | null;

  // Actions
  setAgentSearch: (query: string) => void;
  setAgentStatusFilter: (filter: AgentStatus | 'all') => void;
  setRunsStatusFilter: (filter: string) => void;
  setRunsSearch: (query: string) => void;
  setComposerDraft: (agentId: string, text: string) => void;
  clearComposerDraft: (agentId: string) => void;
  setExpandedRun: (id: string | null) => void;
  resetFilters: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  agentSearchQuery: '',
  agentStatusFilter: 'all',
  runsStatusFilter: 'all',
  runsSearchQuery: '',
  composerDrafts: {},
  expandedRunId: null,

  setAgentSearch: (query) => set({ agentSearchQuery: query }),
  setAgentStatusFilter: (filter) => set({ agentStatusFilter: filter }),
  setRunsStatusFilter: (filter) => set({ runsStatusFilter: filter }),
  setRunsSearch: (query) => set({ runsSearchQuery: query }),

  setComposerDraft: (agentId, text) =>
    set((state) => ({
      composerDrafts: { ...state.composerDrafts, [agentId]: text },
    })),

  clearComposerDraft: (agentId) =>
    set((state) => {
      const { [agentId]: _, ...rest } = state.composerDrafts;
      return { composerDrafts: rest };
    }),

  setExpandedRun: (id) => set({ expandedRunId: id }),

  resetFilters: () =>
    set({
      agentSearchQuery: '',
      agentStatusFilter: 'all',
      runsStatusFilter: 'all',
      runsSearchQuery: '',
    }),
}));
