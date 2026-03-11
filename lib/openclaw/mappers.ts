/**
 * Mappers: transform raw gateway responses into UI-friendly view models.
 * Keeps backend contract changes out of screen components.
 */
import { DEFAULT_GATEWAY_CAPABILITIES } from '@/lib/openclaw/auth';
import type {
  ActivityEntry,
  Agent,
  AgentDetailViewModel,
  AgentStatus,
  ChannelBinding,
  ChatMessage,
  ConversationViewModel,
  GatewayActivityResponse,
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
  RunStatus,
  RunSummary,
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

function fallbackAgentDescription(raw: GatewayAgentResponse) {
  if (raw.isCoordinator || raw.role === 'coordinator') {
    return 'Primary coordinator agent';
  }

  if (raw.specialistType) {
    return `${raw.specialistType} specialist`;
  }

  return 'Operational specialist';
}

export function mapAgentSummary(raw: GatewayAgentResponse): Agent {
  return {
    id: raw.id,
    name: raw.name,
    avatar: raw.avatar ?? null,
    status: (raw.status ?? 'offline') as AgentStatus,
    model: raw.model ?? 'unknown',
    provider: raw.provider ?? 'unknown',
    channels: (raw.channels ?? []).map(mapChannel),
    lastActivity: formatTimeAgo(raw.lastActivityAt),
    description: raw.description?.trim() || fallbackAgentDescription(raw),
    systemPrompt: '',
    agentDir: raw.agentDir ?? '',
    role: raw.role ?? (raw.isCoordinator ? 'coordinator' : 'specialist'),
    specialistType: raw.specialistType ?? null,
    isCoordinator: raw.isCoordinator ?? raw.role === 'coordinator',
    conversationId: raw.conversationId ?? null,
    lastRun: raw.currentRun ? mapRunSummary(raw.currentRun) : null,
    allowedActions: raw.allowedActions ?? [],
    metadata: raw.metadata,
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
    agent: {
      ...mapAgentSummary(raw),
      systemPrompt: raw.systemPrompt ?? '',
      agentDir: raw.agentDir ?? raw.agentDir ?? '',
    },
    recentRuns: (raw.recentRuns ?? []).map(mapRunSummary),
    allowedActions: raw.allowedActions ?? [],
    incidents: (raw.incidents ?? []).map(mapIncident),
  };
}

export function mapRunSummary(raw: GatewayRunResponse): RunSummary {
  return {
    id: raw.id,
    agentId: raw.agentId,
    agentName: raw.agentName ?? '',
    conversationId: raw.conversationId ?? null,
    status: (raw.status ?? 'queued') as RunStatus,
    title: raw.title ?? 'Untitled run',
    summary:
      raw.summary ??
      (raw.errorMessage
        ? 'Run failed'
        : raw.status === 'running'
          ? 'Run in progress'
          : 'Recent run'),
    createdAt: raw.createdAt,
    startedAt: raw.startedAt ?? null,
    updatedAt: raw.updatedAt ?? raw.completedAt ?? raw.startedAt ?? raw.createdAt,
    completedAt: raw.completedAt ?? null,
    durationMs: raw.durationMs ?? null,
    errorMessage: raw.errorMessage ?? null,
    incidentId: raw.incidentId ?? null,
    auditId: raw.auditId ?? null,
    delegatedAgentIds: raw.delegatedAgentIds ?? [],
    delegatedAgentNames: raw.delegatedAgentNames ?? [],
    canRetry:
      raw.canRetry ??
      (raw.status === 'failed' ||
        raw.status === 'degraded' ||
        raw.status === 'cancelled'),
    metadata: raw.metadata,
  };
}

export function mapIncident(raw: GatewayIncidentResponse): Incident {
  return {
    id: raw.id,
    title: raw.title ?? 'Unknown incident',
    summary: raw.summary ?? 'Operator attention required.',
    severity: (raw.severity ?? 'info') as IncidentSeverity,
    status: (raw.status ?? 'open') as IncidentStatus,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.createdAt ?? new Date().toISOString(),
    resolvedAt: raw.resolvedAt ?? null,
    agentId: raw.agentId ?? null,
    agentName: raw.agentName ?? '',
    runId: raw.runId ?? null,
    conversationId: raw.conversationId ?? null,
    auditId: raw.auditId ?? null,
    metadata: raw.metadata,
  };
}

export function mapActivity(raw: GatewayActivityResponse): ActivityEntry {
  return {
    id: raw.id,
    agentId: raw.agentId,
    agentName: raw.agentName,
    type: raw.type,
    title: raw.title,
    detail: raw.detail,
    timestamp: raw.timestamp,
    channel: raw.channel,
    runId: raw.runId ?? null,
    incidentId: raw.incidentId ?? null,
    severity: raw.severity,
  };
}

export function mapConversationMessage(raw: GatewayConversationMessageResponse): ChatMessage {
  return {
    id: raw.id,
    agentId: raw.agentId ?? '',
    role: raw.role as ChatMessage['role'],
    content: raw.content ?? '',
    timestamp: raw.createdAt ?? new Date().toISOString(),
    conversationId: raw.conversationId ?? null,
    runId: raw.runId ?? null,
    status: raw.status,
    metadata: raw.metadata,
  };
}

export function mapConversation(raw: GatewayConversationResponse): ConversationViewModel {
  return {
    id: raw.id,
    agentId: raw.agentId,
    agentName: raw.agentName,
    messages: (raw.messages ?? []).map(mapConversationMessage),
    events: raw.events ?? [],
    latestRun: raw.latestRun ? mapRunSummary(raw.latestRun) : null,
    nextCursor: raw.nextCursor ?? null,
  };
}

export function mapGatewayOverview(raw: GatewayOverviewResponse): OverviewViewModel {
  const agents = (raw.agents ?? []).map(mapAgentSummary);
  const coordinator =
    (raw.coordinator ? mapAgentSummary(raw.coordinator) : null) ??
    agents.find((agent) => agent.isCoordinator || agent.role === 'coordinator') ??
    null;
  const recentRuns = (raw.recentRuns ?? []).map(mapRunSummary);
  const openIncidents = (raw.incidents ?? [])
    .map(mapIncident)
    .filter((incident) => incident.status !== 'resolved');
  const capabilities = {
    ...DEFAULT_GATEWAY_CAPABILITIES,
    ...raw.gateway.capabilities,
    ...raw.session?.capabilities,
  };

  return {
    gateway: {
      online: raw.gateway.online ?? false,
      uptime: raw.gateway.uptime ?? 'unknown',
      version: raw.gateway.version ?? 'unknown',
      totalAgents: raw.stats?.totalAgents ?? agents.length,
      onlineAgents: raw.stats?.onlineAgents ?? agents.filter((agent) => agent.status !== 'offline').length,
      activeChannels:
        raw.stats?.activeChannels ??
        agents.reduce(
          (count, agent) => count + agent.channels.filter((channel) => channel.connected).length,
          0
        ),
      pendingJobs: raw.stats?.pendingJobs ?? 0,
      openIncidents: raw.stats?.openIncidents ?? openIncidents.length,
      activeRuns:
        raw.stats?.activeRuns ??
        recentRuns.filter((run) => run.status === 'running' || run.status === 'queued').length,
      lastSyncAt: raw.gateway.lastSyncAt,
      latencyMs: raw.gateway.latencyMs ?? null,
      capabilities,
    },
    coordinatorId: coordinator?.id ?? null,
    coordinator,
    agents,
    recentRuns,
    openIncidents,
    activity: (raw.activity ?? []).map(mapActivity),
    capabilities,
    session: raw.session ?? null,
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
