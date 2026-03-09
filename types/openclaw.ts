export type AgentStatus = 'online' | 'offline' | 'busy';

export type ChannelType = 'whatsapp' | 'telegram' | 'discord' | 'imessage';

export interface ChannelBinding {
  id: string;
  type: ChannelType;
  identifier: string;
  label: string;
  connected: boolean;
}

export interface Agent {
  id: string;
  name: string;
  status: AgentStatus;
  model: string;
  provider: string;
  channels: ChannelBinding[];
  lastActivity: string;
  description: string;
  systemPrompt: string;
  agentDir: string;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
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

export interface GatewayStatus {
  online: boolean;
  uptime: string;
  version: string;
  totalAgents: number;
  onlineAgents: number;
  activeChannels: number;
  pendingJobs: number;
}

export type ActivityType = 'message' | 'task' | 'alert' | 'system' | 'channel';

export interface ActivityEntry {
  id: string;
  agentId: string;
  agentName: string;
  type: ActivityType;
  title: string;
  detail: string;
  timestamp: string;
  channel?: ChannelType;
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
