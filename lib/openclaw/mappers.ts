/**
 * Mappers: transform raw gateway responses into UI-friendly view models.
 * Keeps backend contract changes out of screen components.
 */
import type {
  Agent,
  AgentDetailViewModel,
  AgentStatus,
  ChannelBinding,
  ChatMessage,
  ConversationViewModel,
  GatewayAgentDetailResponse,
  GatewayAgentResponse,
  GatewayConversationMessageResponse,
  GatewayConversationResponse,
  GatewayIncidentResponse,
  GatewayOverviewResponse,
  GatewayRunResponse,
  HeartbeatEntry,
  Incident,
  IncidentSeverity,
  IncidentStatus,
  OverviewViewModel,
  RunSummary,
  RunStatus,
} from '@/types/openclaw';

function formatTimeAgo(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export function mapAgentSummary(raw: GatewayAgentResponse): Agent {
  return {
    id: raw.id,
    name: raw.name,
    status: (raw.status ?? 'offline') as AgentStatus,
    model: raw.model ?? 'unknown',
    provider: raw.provider ?? 'unknown',
    channels: (raw.channels ?? []).map(mapChannel),
    lastActivity: formatTimeAgo(raw.lastActivityAt),
    description: raw.description ?? '',
    systemPrompt: '',
    agentDir: raw.agentDir ?? '',
  };
}

function mapChannel(raw: {
  id: string;
  type: string;
  identifier?: string;
  label?: string;
  connected?: boolean;
}): ChannelBinding {
  return {
    id: raw.id,
    type: raw.type as ChannelBinding['type'],
    identifier: raw.identifier ?? '',
    label: raw.label ?? raw.type,
    connected: raw.connected ?? false,
  };
}

export function mapAgentDetail(raw: GatewayAgentDetailResponse): AgentDetailViewModel {
  return {
    agent: mapAgentSummary(raw),
    recentRuns: (raw.recentRuns ?? []).map(mapRunSummary),
    allowedActions: raw.allowedActions ?? [],
  };
}

export function mapRunSummary(raw: GatewayRunResponse): RunSummary {
  return {
    id: raw.id,
    name: raw.name ?? 'Unnamed run',
    agentId: raw.agentId,
    agentName: raw.agentName ?? '',
    status: (raw.status ?? 'queued') as RunStatus,
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
    durationMs: raw.durationMs ?? null,
    error: raw.error ?? null,
    triggerType: (raw.triggerType ?? 'manual') as RunSummary['triggerType'],
    canRetry: raw.canRetry ?? false,
  };
}

export function mapIncident(raw: GatewayIncidentResponse): Incident {
  return {
    id: raw.id,
    title: raw.title ?? 'Unknown incident',
    description: raw.description ?? '',
    severity: (raw.severity ?? 'info') as IncidentSeverity,
    status: (raw.status ?? 'open') as IncidentStatus,
    affectedResourceId: raw.affectedResourceId ?? '',
    affectedResourceType: (raw.affectedResourceType ?? 'agent') as Incident['affectedResourceType'],
    affectedResourceName: raw.affectedResourceName ?? '',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    resolvedAt: raw.resolvedAt ?? null,
  };
}

export function mapConversationMessage(raw: GatewayConversationMessageResponse): ChatMessage {
  return {
    id: raw.id,
    agentId: raw.agentId ?? '',
    role: raw.role as ChatMessage['role'],
    content: raw.content ?? '',
    timestamp: raw.timestamp ?? new Date().toISOString(),
    metadata: raw.metadata,
  };
}

export function mapConversation(raw: GatewayConversationResponse): ConversationViewModel {
  return {
    agentId: raw.agentId,
    messages: (raw.messages ?? []).map(mapConversationMessage),
    hasMore: raw.hasMore ?? false,
    nextCursor: raw.nextCursor ?? null,
  };
}

export function mapGatewayOverview(raw: GatewayOverviewResponse): OverviewViewModel {
  return {
    gateway: {
      online: raw.online ?? false,
      uptime: raw.uptime ?? 'unknown',
      version: raw.version ?? 'unknown',
      totalAgents: raw.totalAgents ?? 0,
      onlineAgents: raw.onlineAgents ?? 0,
      activeChannels: raw.activeChannels ?? 0,
      pendingJobs: raw.pendingJobs ?? 0,
    },
    agents: (raw.agents ?? []).map(mapAgentSummary),
    recentRuns: (raw.recentRuns ?? []).map(mapRunSummary),
    openIncidents: (raw.openIncidents ?? []).map(mapIncident),
    capabilities: raw.capabilities ?? {
      canRestartAgent: false,
      canRetryRun: false,
      canSendMessage: true,
      canPingAgent: true,
      canEditConfig: false,
      canManageChannels: false,
      canManageCron: false,
    },
    coordinatorId: raw.coordinatorId ?? null,
  };
}

export function mapHeartbeat(raw: {
  id: string;
  targetId: string;
  targetName: string;
  targetType: string;
  status: string;
  latencyMs: number;
  lastPing: string;
  uptimePercent: number;
}): HeartbeatEntry {
  return {
    id: raw.id,
    targetId: raw.targetId,
    targetName: raw.targetName,
    targetType: raw.targetType as HeartbeatEntry['targetType'],
    status: raw.status as HeartbeatEntry['status'],
    latencyMs: raw.latencyMs,
    lastPing: raw.lastPing,
    uptimePercent: raw.uptimePercent,
  };
}
