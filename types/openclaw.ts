export type AgentStatus = 'online' | 'offline' | 'busy' | 'degraded';

export type ChannelType = 'whatsapp' | 'telegram' | 'discord' | 'imessage';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unauthorized'
  | 'offline'
  | 'error';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool' | 'event';

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'degraded';

export type IncidentSeverity = 'info' | 'warning' | 'critical';

export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

export type ActivityType = 'message' | 'task' | 'alert' | 'system' | 'channel';

export interface ChannelBinding {
  id: string;
  type: ChannelType;
  identifier: string;
  label: string;
  connected: boolean;
}

export interface GatewayCapabilities {
  canReadOverview: boolean;
  canReadAgents: boolean;
  canReadRuns: boolean;
  canReadIncidents: boolean;
  canReadConversation: boolean;
  canWriteConversation: boolean;
  canRetryRun: boolean;
  canRestartAgent: boolean;
  canPingAgent: boolean;
  supportsStreaming: boolean;
  supportsRealtimeEvents: boolean;
  supportsPolling: boolean;
}

export interface RunSummary {
  id: string;
  agentId: string;
  agentName?: string;
  conversationId?: string | null;
  status: RunStatus;
  title: string;
  summary: string;
  createdAt: string;
  startedAt?: string | null;
  updatedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  incidentId?: string | null;
  auditId?: string | null;
  delegatedAgentIds?: string[];
  delegatedAgentNames?: string[];
  canRetry?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Incident {
  id: string;
  title: string;
  summary: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  agentId?: string | null;
  agentName?: string;
  runId?: string | null;
  conversationId?: string | null;
  auditId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  avatar?: string | null;
  status: AgentStatus;
  model: string;
  provider: string;
  channels: ChannelBinding[];
  lastActivity: string;
  description: string;
  systemPrompt: string;
  agentDir: string;
  role?: 'coordinator' | 'specialist';
  specialistType?: string | null;
  isCoordinator?: boolean;
  conversationId?: string | null;
  lastRun?: RunSummary | null;
  allowedActions?: string[];
  metadata?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  conversationId?: string | null;
  runId?: string | null;
  status?: 'pending' | 'streaming' | 'complete' | 'failed';
  metadata?: Record<string, unknown>;
}

export interface CronJob {
  id: string;
  name: string;
  expression: string;
  agentId: string;
  agentName: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string;
  description: string;
  command: string;
}

export interface HeartbeatEntry {
  id: string;
  targetId: string;
  targetName: string;
  targetType: 'agent' | 'gateway' | 'channel';
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  lastPing: string;
  uptimePercent: number;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  capabilities: string[];
  description: string;
}

export interface ServerProfile {
  id: string;
  name: string;
  address: string;
  username: string;
  password: string;
  isActive: boolean;
}

export interface Session {
  id: string;
  gatewayUrl: string;
  operatorId?: string | null;
  operatorName?: string | null;
  connectionState: ConnectionState;
  capabilities: GatewayCapabilities;
  issuedAt?: string | null;
  lastValidatedAt?: string | null;
  connectedAt?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenExpiresAt?: string | null;
  gatewayName?: string | null;
  gatewayVersion?: string | null;
  metadata?: Record<string, unknown>;
}

export interface GatewayStatus {
  online: boolean;
  uptime: string;
  version: string;
  totalAgents: number;
  onlineAgents: number;
  activeChannels: number;
  pendingJobs: number;
  openIncidents?: number;
  activeRuns?: number;
  lastSyncAt?: string;
  latencyMs?: number | null;
  capabilities?: GatewayCapabilities;
}

export interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  type: ActivityType;
  title: string;
  detail: string;
  timestamp: string;
  channel?: ChannelType;
  runId?: string | null;
  incidentId?: string | null;
  severity?: IncidentSeverity;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  agentId: string;
  command: string;
  color: string;
  glow: string;
}

export interface ConversationViewModel {
  id: string;
  agentId: string;
  agentName?: string;
  messages: ChatMessage[];
  events: EventPayload[];
  latestRun?: RunSummary | null;
  nextCursor?: string | null;
}

export interface AgentDetailViewModel {
  agent: Agent;
  recentRuns: RunSummary[];
  allowedActions: string[];
  incidents: Incident[];
}

export interface OverviewViewModel {
  gateway: GatewayStatus;
  coordinatorId: string | null;
  coordinator: Agent | null;
  agents: Agent[];
  recentRuns: RunSummary[];
  openIncidents: Incident[];
  activity: ActivityEntry[];
  capabilities: GatewayCapabilities;
  session?: Partial<Session> | null;
}

export interface GatewayCollectionResponse<T> {
  items: T[];
  nextCursor?: string | null;
  total?: number;
}

export interface GatewayChannelResponse {
  id: string;
  type: ChannelType;
  identifier: string;
  label?: string;
  connected: boolean;
}

export interface GatewayRunResponse {
  id: string;
  agentId: string;
  agentName?: string;
  conversationId?: string | null;
  status: RunStatus;
  title?: string;
  summary?: string;
  createdAt: string;
  startedAt?: string | null;
  updatedAt?: string;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  incidentId?: string | null;
  auditId?: string | null;
  delegatedAgentIds?: string[];
  delegatedAgentNames?: string[];
  canRetry?: boolean;
  metadata?: Record<string, unknown>;
}

export interface GatewayIncidentResponse {
  id: string;
  title: string;
  summary?: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  agentId?: string | null;
  agentName?: string;
  runId?: string | null;
  conversationId?: string | null;
  auditId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface GatewayActivityResponse {
  id: string;
  agentId: string;
  agentName: string;
  type: ActivityType;
  title: string;
  detail: string;
  timestamp: string;
  channel?: ChannelType;
  runId?: string | null;
  incidentId?: string | null;
  severity?: IncidentSeverity;
}

export interface GatewayConversationMessageResponse {
  id: string;
  agentId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  conversationId?: string | null;
  runId?: string | null;
  status?: ChatMessage['status'];
  metadata?: Record<string, unknown>;
}

export interface GatewayAgentResponse {
  id: string;
  name: string;
  avatar?: string | null;
  status: AgentStatus;
  model?: string;
  provider?: string;
  description?: string;
  agentDir?: string;
  lastActivityAt?: string | null;
  role?: 'coordinator' | 'specialist';
  specialistType?: string | null;
  isCoordinator?: boolean;
  channels?: GatewayChannelResponse[];
  currentRun?: GatewayRunResponse | null;
  allowedActions?: string[];
  conversationId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface GatewayAgentDetailResponse extends GatewayAgentResponse {
  systemPrompt?: string;
  agentDir?: string;
  recentRuns?: GatewayRunResponse[];
  incidents?: GatewayIncidentResponse[];
}

export interface GatewayConversationResponse {
  id: string;
  agentId: string;
  agentName?: string;
  messages: GatewayConversationMessageResponse[];
  events?: EventPayload[];
  latestRun?: GatewayRunResponse | null;
  nextCursor?: string | null;
}

export interface GatewayMessageSendResponse {
  conversationId: string;
  message: GatewayConversationMessageResponse;
  acceptedAt: string;
}

export interface GatewayActionResponse {
  action: 'retryRun' | 'restartAgent' | 'pingAgent';
  success: boolean;
  auditId?: string | null;
  message?: string;
  run?: GatewayRunResponse | null;
  agent?: GatewayAgentResponse | null;
}

export interface GatewayOverviewResponse {
  gateway: {
    id: string;
    name: string;
    online: boolean;
    version?: string;
    uptime?: string;
    latencyMs?: number | null;
    lastSyncAt?: string;
    capabilities?: Partial<GatewayCapabilities>;
  };
  session?: Partial<Session> | null;
  stats?: {
    totalAgents?: number;
    onlineAgents?: number;
    activeChannels?: number;
    pendingJobs?: number;
    openIncidents?: number;
    activeRuns?: number;
  };
  coordinator?: GatewayAgentResponse | null;
  agents: GatewayAgentResponse[];
  recentRuns?: GatewayRunResponse[];
  incidents?: GatewayIncidentResponse[];
  activity?: GatewayActivityResponse[];
}

export interface AgentQuery {
  search?: string;
  status?: AgentStatus | AgentStatus[];
  includeCoordinator?: boolean;
}

export interface ConversationQuery {
  conversationId?: string;
  agentId?: string;
  before?: string;
  limit?: number;
}

export interface SendMessageInput {
  conversationId?: string;
  agentId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RunsQuery {
  status?: RunStatus | RunStatus[];
  agentId?: string;
  conversationId?: string;
  limit?: number;
  cursor?: string;
}

export interface IncidentsQuery {
  status?: IncidentStatus | IncidentStatus[];
  severity?: IncidentSeverity | IncidentSeverity[];
  agentId?: string;
  runId?: string;
  limit?: number;
  cursor?: string;
}

export interface BaseEventPayload<TType extends string, TPayload extends Record<string, unknown>> {
  id: string;
  type: TType;
  createdAt: string;
  conversationId?: string | null;
  agentId?: string | null;
  runId?: string | null;
  payload: TPayload;
}

export type MessageDeltaEvent = BaseEventPayload<
  'message.delta',
  {
    messageId: string;
    delta: string;
  }
>;

export type MessageCompletedEvent = BaseEventPayload<
  'message.completed',
  {
    message: GatewayConversationMessageResponse;
  }
>;

export type DelegationEvent = BaseEventPayload<
  'delegation',
  {
    fromAgentId: string;
    fromAgentName?: string;
    toAgentId: string;
    toAgentName?: string;
    summary?: string;
  }
>;

export type ToolStartedEvent = BaseEventPayload<
  'tool.started',
  {
    toolName: string;
    input?: Record<string, unknown>;
  }
>;

export type ToolCompletedEvent = BaseEventPayload<
  'tool.completed',
  {
    toolName: string;
    output?: Record<string, unknown>;
  }
>;

export type RunUpdatedEvent = BaseEventPayload<
  'run.updated',
  {
    run: GatewayRunResponse;
  }
>;

export type IncidentCreatedEvent = BaseEventPayload<
  'incident.created',
  {
    incident: GatewayIncidentResponse;
  }
>;

export type AgentUpdatedEvent = BaseEventPayload<
  'agent.updated',
  {
    agent: GatewayAgentResponse;
  }
>;

export type ConnectionStateEvent = BaseEventPayload<
  'connection.state',
  {
    state: ConnectionState;
    reason?: string;
  }
>;

export type GenericEventPayload = BaseEventPayload<string, Record<string, unknown>>;

export type EventPayload =
  | MessageDeltaEvent
  | MessageCompletedEvent
  | DelegationEvent
  | ToolStartedEvent
  | ToolCompletedEvent
  | RunUpdatedEvent
  | IncidentCreatedEvent
  | AgentUpdatedEvent
  | ConnectionStateEvent
  | GenericEventPayload;
