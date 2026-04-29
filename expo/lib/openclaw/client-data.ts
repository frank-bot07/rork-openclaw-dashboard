import type {
  AgentQuery,
  AgentStatus,
  ChannelType,
  ConnectionState,
  ConversationQuery,
  GatewayActivityResponse,
  GatewayAgentResponse,
  GatewayCapabilities,
  GatewayCollectionResponse,
  GatewayConversationMessageResponse,
  GatewayConversationResponse,
  GatewayIncidentResponse,
  GatewayOverviewResponse,
  GatewayRunResponse,
  IncidentsQuery,
  RunsQuery,
  SendMessageInput,
} from '@/types/openclaw';
import type {
  GatewayNodeSnapshot,
  GatewaySessionSnapshot,
  OpenClawRequestSender,
  SnapshotState,
} from '@/lib/openclaw/client-types';
import {
  API_POLLING_INTERVAL_MS,
  SUPPORTED_PROTOCOL_VERSION,
} from '@/lib/openclaw/client-types';
import {
  asRecord,
  createId,
  dedupeById,
  dedupeStrings,
  firstBoolean,
  firstNumber,
  firstString,
  getArray,
  normalizeStringArray,
  safeHostname,
} from '@/lib/openclaw/client-utils';

export class OpenClawClientDataStore {
  private snapshot: SnapshotState = createEmptySnapshotState();
  private lastGatewayDataRefreshAt = 0;
  private refreshGatewayDataPromise: Promise<void> | null = null;

  constructor(
    private readonly sendRequest: OpenClawRequestSender,
    private readonly getConnectionState: () => ConnectionState
  ) {}

  hasSnapshot() {
    return Boolean(this.snapshot.overview);
  }

  peekOverview() {
    return this.snapshot.overview ? cloneOverview(this.snapshot.overview) : null;
  }

  peekAgent(agentId: string) {
    const agent = this.buildAgentSnapshot(agentId);
    return agent ? cloneAgent(agent) : null;
  }

  peekAgents(query?: AgentQuery): GatewayCollectionResponse<GatewayAgentResponse> {
    const items = filterAgents(this.collectAgentSnapshots(), query);

    return {
      items,
      total: items.length,
    };
  }

  peekConversation(query: ConversationQuery) {
    const sessionKey = this.resolveSessionKey(query);

    if (!sessionKey) {
      return null;
    }

    const conversation = this.snapshot.conversationsBySessionKey.get(sessionKey);
    return conversation ? cloneConversation(conversation) : null;
  }

  peekRuns(query?: RunsQuery): GatewayCollectionResponse<GatewayRunResponse> {
    const items = filterRuns([...this.snapshot.runsById.values()].map(cloneRun), query);

    return {
      items,
      total: items.length,
    };
  }

  peekIncidents(query?: IncidentsQuery): GatewayCollectionResponse<GatewayIncidentResponse> {
    const items = filterIncidents(
      [...this.snapshot.incidentsById.values()].map(cloneIncident),
      query
    );

    return {
      items,
      total: items.length,
    };
  }

  getConversationKeyForAgent(agentId: string) {
    return resolveDefaultSessionKeyForAgent(agentId, this.snapshot);
  }

  getAgentIdForConversation(sessionKey: string) {
    return this.snapshot.agentIdBySessionKey.get(sessionKey) ?? null;
  }

  buildAgentSnapshot(agentId: string) {
    const base = this.snapshot.agentsById.get(agentId);

    if (!base) {
      return null;
    }

    const sessions = sortSessionSnapshots(
      [...this.snapshot.sessionsByKey.values()]
        .filter((session) => session.agentId === agentId)
        .map(cloneSessionSnapshot)
    );
    const latestSession = sessions[0] ?? null;
    const activeSession =
      sessions.find((session) => session.status === 'running' || session.status === 'queued') ??
      latestSession;
    const channels = mergeAgentChannels(base.channels ?? [], sessions);
    const currentRun = activeSession
      ? sessionToRun(activeSession, {
          agentName: base.name,
        })
      : base.currentRun ?? null;

    return mergeAgent(base, {
      ...base,
      status: deriveAgentStatus(base, sessions),
      model: latestSession?.model ?? base.model ?? 'unknown',
      provider: latestSession?.provider ?? base.provider ?? 'unknown',
      lastActivityAt:
        latestSession?.updatedAt ?? base.lastActivityAt ?? new Date().toISOString(),
      channels,
      currentRun,
      conversationId: resolveDefaultSessionKeyForAgent(agentId, this.snapshot),
      role: agentId === this.snapshot.defaultAgentId ? 'coordinator' : base.role,
      isCoordinator:
        agentId === this.snapshot.defaultAgentId ? true : base.isCoordinator,
    });
  }

  replaceOverviewSnapshot(overview: GatewayOverviewResponse) {
    this.snapshot = createEmptySnapshotState();
    this.snapshot.overview = cloneOverview(overview);

    for (const agent of overview.agents ?? []) {
      const normalizedAgent = normalizeAgentPayload(agent);
      if (normalizedAgent) {
        this.upsertAgent(normalizedAgent);
      }
    }

    for (const run of overview.recentRuns ?? []) {
      this.upsertRun(normalizeRunPayload(run));
    }

    for (const incident of overview.incidents ?? []) {
      this.upsertIncident(normalizeIncidentPayload(incident));
    }

    this.syncOverviewCollections();
  }

  handleConnectionStateChange() {
    this.syncOverviewCollections();
  }

  async bootstrapGatewayData(signal?: AbortSignal) {
    await this.refreshGatewayData(signal, true);
  }

  async refreshGatewayData(signal?: AbortSignal, force = false) {
    if (
      !force &&
      Date.now() - this.lastGatewayDataRefreshAt < API_POLLING_INTERVAL_MS &&
      this.snapshot.agentsById.size > 0
    ) {
      return;
    }

    if (this.refreshGatewayDataPromise) {
      return this.refreshGatewayDataPromise;
    }

    this.refreshGatewayDataPromise = (async () => {
      const agentsPayload = await this.sendRequest('agents.list', {}, { signal, retryable: false });
      const agentList = normalizeAgentsListPayload(agentsPayload);
      const defaultAgentId = agentList.defaultId ?? this.snapshot.defaultAgentId;
      const agentIds = dedupeStrings(
        agentList.agents
          .map((entry) => entry.id)
          .filter((entry): entry is string => Boolean(entry))
      );
      const identityResponses = await Promise.all(
        agentIds.map(async (agentId) => {
          try {
            const payload = await this.sendRequest(
              'agent.identity.get',
              { agentId },
              { signal, retryable: false }
            );
            return { agentId, payload };
          } catch (error) {
            console.warn(`[OpenClaw] Failed to load identity for agent "${agentId}".`, error);
            return { agentId, payload: null };
          }
        })
      );
      const sessionsPayload = await this.sendRequest(
        'sessions.list',
        {
          activeMinutes: 120,
          limit: 20,
        },
        {
          signal,
          retryable: false,
        }
      );

      this.applyRpcSnapshot({
        defaultAgentId,
        agentIds,
        identities: identityResponses,
        sessionsPayload,
      });
      this.lastGatewayDataRefreshAt = Date.now();
      this.syncOverviewCollections();
    })().finally(() => {
      this.refreshGatewayDataPromise = null;
    });

    return this.refreshGatewayDataPromise;
  }

  applyRpcSnapshot(input: {
    defaultAgentId: string | null;
    agentIds: string[];
    identities: { agentId: string; payload: unknown }[];
    sessionsPayload: unknown;
  }) {
    this.snapshot.defaultAgentId = input.defaultAgentId;
    this.snapshot.agentsById.clear();
    this.snapshot.sessionKeyByAgentId.clear();
    this.snapshot.agentIdBySessionKey.clear();
    this.snapshot.sessionsByKey.clear();
    this.snapshot.runsById.clear();

    const identitiesByAgentId = new Map(
      input.identities.map((entry) => [
        entry.agentId,
        normalizeAgentIdentityPayload(entry.payload, entry.agentId),
      ])
    );
    const sessions = normalizeSessionsListPayload(input.sessionsPayload);
    const sessionAgentIds = dedupeStrings(sessions.map((session) => session.agentId));
    const allAgentIds = dedupeStrings([
      ...input.agentIds,
      ...sessionAgentIds,
      ...(input.defaultAgentId ? [input.defaultAgentId] : []),
    ]);

    for (const agentId of allAgentIds) {
      const identity = identitiesByAgentId.get(agentId);
      const fallback = this.snapshot.overview?.agents.find((agent) => agent.id === agentId);
      const agent = normalizeAgentPayload(
        {
          id: agentId,
          agentId,
          name: identity?.name ?? fallback?.name ?? agentId,
          avatar: identity?.avatar ?? fallback?.avatar ?? null,
          role: agentId === input.defaultAgentId ? 'coordinator' : fallback?.role,
          isCoordinator:
            agentId === input.defaultAgentId ? true : fallback?.isCoordinator,
        },
        fallback
      );

      if (agent) {
        this.upsertAgent(agent);
      }
    }

    for (const session of sessions) {
      this.upsertSession(session);
      this.upsertRun(
        sessionToRun(session, {
          agentName:
            this.snapshot.agentsById.get(session.agentId)?.name ??
            session.agentName ??
            session.agentId,
        })
      );
    }
  }

  collectAgentSnapshots() {
    return sortAgents(
      [...this.snapshot.agentsById.keys()]
        .map((agentId) => this.buildAgentSnapshot(agentId))
        .filter((agent): agent is GatewayAgentResponse => Boolean(agent))
        .map(cloneAgent)
    );
  }

  upsertAgent(agent: GatewayAgentResponse) {
    const existing = this.snapshot.agentsById.get(agent.id);
    const merged = mergeAgent(existing, agent);
    this.snapshot.agentsById.set(merged.id, merged);

    const sessionKey = merged.conversationId ?? null;
    if (sessionKey) {
      this.snapshot.sessionKeyByAgentId.set(merged.id, sessionKey);
      this.snapshot.agentIdBySessionKey.set(sessionKey, merged.id);
    }

    if (merged.currentRun) {
      this.upsertRun(merged.currentRun);
    }
  }

  upsertRun(run: GatewayRunResponse | null) {
    if (!run?.id) {
      return;
    }

    const normalizedRun =
      !run.agentName && run.agentId
        ? {
            ...run,
            agentName: this.buildAgentSnapshot(run.agentId)?.name ?? run.agentName ?? '',
          }
        : run;
    const existing = this.snapshot.runsById.get(run.id);
    const merged = mergeRun(existing, normalizedRun);
    this.snapshot.runsById.set(merged.id, merged);
  }

  upsertIncident(incident: GatewayIncidentResponse | null) {
    if (!incident?.id) {
      return;
    }

    const existing = this.snapshot.incidentsById.get(incident.id);
    const merged = mergeIncident(existing, incident);
    this.snapshot.incidentsById.set(merged.id, merged);
  }

  upsertNode(node: GatewayNodeSnapshot | null) {
    if (!node?.id) {
      return;
    }

    this.snapshot.nodesById.set(node.id, {
      ...node,
      metadata: { ...node.metadata },
    });
  }

  upsertConversation(conversation: GatewayConversationResponse) {
    const existing = this.snapshot.conversationsBySessionKey.get(conversation.id);
    const merged = mergeConversation(existing, conversation);
    this.snapshot.conversationsBySessionKey.set(merged.id, merged);

    if (merged.agentId) {
      this.snapshot.agentIdBySessionKey.set(merged.id, merged.agentId);
      this.snapshot.sessionKeyByAgentId.set(merged.agentId, merged.id);
    }

    if (merged.latestRun) {
      this.upsertRun(merged.latestRun);
    }
  }

  upsertConversationMessage(
    sessionKey: string,
    message: GatewayConversationMessageResponse | null
  ) {
    if (!message) {
      return;
    }

    const existing = ensureConversation(this.snapshot.conversationsBySessionKey.get(sessionKey), {
      id: sessionKey,
      agentId: message.agentId,
      agentName: message.agentId
        ? this.snapshot.agentsById.get(message.agentId)?.name
        : undefined,
    });
    const byId = new Map(existing.messages.map((entry) => [entry.id, entry]));
    byId.set(message.id, mergeConversationMessage(byId.get(message.id), message));
    const nextConversation: GatewayConversationResponse = {
      ...existing,
      id: sessionKey,
      agentId: existing.agentId || message.agentId,
      messages: sortConversationMessages([...byId.values()].map(cloneMessage)),
      nextCursor: message.createdAt,
    };

    this.upsertConversation(nextConversation);
  }

  resolveSessionKey(query: ConversationQuery) {
    if (query.conversationId && !query.conversationId.startsWith('pending:')) {
      return query.conversationId;
    }

    if (query.agentId) {
      return resolveDefaultSessionKeyForAgent(query.agentId, this.snapshot);
    }

    return null;
  }

  resolveOutgoingSessionKey(input: Pick<SendMessageInput, 'agentId' | 'conversationId'>) {
    return resolveOutgoingSessionKey(input, this.snapshot);
  }

  upsertSession(session: GatewaySessionSnapshot | null) {
    if (!session?.sessionKey || !session.agentId) {
      return;
    }

    const existing = this.snapshot.sessionsByKey.get(session.sessionKey);
    const merged = mergeSessionSnapshot(existing, session);
    this.snapshot.sessionsByKey.set(merged.sessionKey, merged);
    this.snapshot.agentIdBySessionKey.set(merged.sessionKey, merged.agentId);

    const currentDefault = this.snapshot.sessionKeyByAgentId.get(merged.agentId);
    const currentSession = currentDefault
      ? this.snapshot.sessionsByKey.get(currentDefault)
      : null;

    if (!currentSession || compareSessionPreference(merged, currentSession) < 0) {
      this.snapshot.sessionKeyByAgentId.set(merged.agentId, merged.sessionKey);
    }
  }

  syncOverviewCollections() {
    if (!this.snapshot.overview) {
      return;
    }

    const agents = sortAgents(this.collectAgentSnapshots());
    const recentRuns = sortRuns([...this.snapshot.runsById.values()].map(cloneRun));
    const incidents = sortIncidents(
      [...this.snapshot.incidentsById.values()].map(cloneIncident)
    );
    const existingStats = this.snapshot.overview.stats ?? {};
    const gateway = this.snapshot.overview.gateway;

    this.snapshot.overview = {
      ...this.snapshot.overview,
      gateway: {
        ...gateway,
        online: this.getConnectionState() === 'connected',
        capabilities: {
          ...gateway.capabilities,
        },
      },
      coordinator:
        agents.find((agent) => agent.id === this.snapshot.defaultAgentId) ??
        agents.find((agent) => agent.isCoordinator || agent.role === 'coordinator') ??
        this.snapshot.overview.coordinator ??
        null,
      agents,
      recentRuns,
      incidents,
      stats: {
        ...existingStats,
        totalAgents: agents.length,
        onlineAgents: agents.filter((agent) => agent.status !== 'offline').length,
        openIncidents: incidents.filter((incident) => incident.status !== 'resolved').length,
        activeRuns: recentRuns.filter(
          (run) => run.status === 'queued' || run.status === 'running'
        ).length,
      },
    };
  }
}

export function normalizeHelloPayload(
  payload: unknown,
  baseUrl: string
): GatewayOverviewResponse {
  const root = asRecord(payload);
  const snapshot = asRecord(root?.snapshot) ?? root ?? {};
  const gatewayRecord = asRecord(snapshot.gateway) ?? asRecord(root?.gateway) ?? {};
  const sessionRecord = asRecord(snapshot.session) ?? asRecord(root?.session) ?? {};
  const statsRecord = asRecord(snapshot.stats) ?? asRecord(root?.stats);
  const activityItems = getArray(snapshot.activity) ?? getArray(root?.activity) ?? [];
  const agentItems = [...(getArray(snapshot.agents) ?? [])];
  const runItems = [
    ...(getArray(snapshot.recentRuns) ?? []),
    ...(getArray(snapshot.runs) ?? getArray(root?.runs) ?? []),
  ];
  const incidentItems = [
    ...(getArray(snapshot.incidents) ?? []),
    ...(getArray(root?.incidents) ?? []),
  ];
  const agents = dedupeById(
    agentItems
      .map((item) => normalizeAgentPayload(item))
      .filter((item): item is GatewayAgentResponse => Boolean(item))
  );
  const recentRuns = dedupeById(
    runItems
      .map((item) => normalizeRunPayload(item))
      .filter((item): item is GatewayRunResponse => Boolean(item))
  );
  const incidents = dedupeById(
    incidentItems
      .map((item) => normalizeIncidentPayload(item))
      .filter((item): item is GatewayIncidentResponse => Boolean(item))
  );
  const gatewayId =
    firstString(gatewayRecord.id, gatewayRecord.gatewayId, root?.gatewayId) ?? baseUrl;
  const gatewayName =
    firstString(gatewayRecord.name, root?.gatewayName, root?.name) ??
    safeHostname(baseUrl);
  const capabilities = normalizeCapabilities(
    asRecord(gatewayRecord.capabilities) ?? asRecord(sessionRecord.capabilities)
  );
  const helloSessionKey = extractSessionKey(root) ?? extractSessionKey(snapshot);
  const activity = activityItems.reduce<GatewayActivityResponse[]>((items, item) => {
    const next = normalizeActivityPayload(item);

    if (next) {
      items.push(next);
    }

    return items;
  }, []);

  return {
    gateway: {
      id: gatewayId,
      name: gatewayName,
      online: true,
      version: firstString(gatewayRecord.version, root?.gatewayVersion),
      uptime: firstString(gatewayRecord.uptime),
      latencyMs: firstNumber(gatewayRecord.latencyMs),
      lastSyncAt:
        firstString(gatewayRecord.lastSyncAt, root?.connectedAt) ??
        new Date().toISOString(),
      capabilities,
    },
    session: {
      id: firstString(sessionRecord.id, root?.sessionId, helloSessionKey) ?? gatewayId,
      operatorId:
        firstString(sessionRecord.operatorId, root?.operatorId, asRecord(root?.operator)?.id) ??
        null,
      operatorName:
        firstString(
          sessionRecord.operatorName,
          root?.operatorName,
          asRecord(root?.operator)?.name
        ) ?? null,
      metadata: {
        ...(asRecord(sessionRecord.metadata) ?? {}),
        protocol: firstNumber(root?.protocol, snapshot.protocol) ?? SUPPORTED_PROTOCOL_VERSION,
        helloSessionKey,
      },
    },
    stats: statsRecord
      ? {
          totalAgents: firstNumber(statsRecord.totalAgents),
          onlineAgents: firstNumber(statsRecord.onlineAgents),
          activeChannels: firstNumber(statsRecord.activeChannels),
          pendingJobs: firstNumber(statsRecord.pendingJobs),
          openIncidents: firstNumber(statsRecord.openIncidents),
          activeRuns: firstNumber(statsRecord.activeRuns),
        }
      : undefined,
    coordinator:
      normalizeAgentPayload(snapshot.coordinator ?? root?.coordinator) ??
      agents.find((agent) => agent.isCoordinator || agent.role === 'coordinator') ??
      null,
    agents,
    recentRuns,
    incidents,
    activity,
  };
}

function normalizeCapabilities(value: Record<string, unknown> | null | undefined) {
  if (!value) {
    return undefined;
  }

  const normalized: Partial<GatewayCapabilities> = {};
  const booleanKeys: (keyof GatewayCapabilities)[] = [
    'canReadOverview',
    'canReadAgents',
    'canReadRuns',
    'canReadIncidents',
    'canReadConversation',
    'canWriteConversation',
    'canRetryRun',
    'canRestartAgent',
    'canPingAgent',
    'supportsStreaming',
    'supportsRealtimeEvents',
    'supportsPolling',
  ];

  booleanKeys.forEach((key) => {
    const rawValue = value[key];
    if (typeof rawValue === 'boolean') {
      normalized[key] = rawValue;
    }
  });

  return normalized;
}

function normalizeActivityPayload(value: unknown) {
  const record = asRecord(value);
  const id = firstString(record?.id);
  const agentId = firstString(record?.agentId);
  const agentName = firstString(record?.agentName);
  const type = firstString(record?.type);
  const title = firstString(record?.title);
  const detail = firstString(record?.detail);
  const timestamp = firstString(record?.timestamp, record?.createdAt);

  if (!id || !agentId || !agentName || !type || !title || !detail || !timestamp) {
    return null;
  }

  return {
    id,
    agentId,
    agentName,
    type: type as GatewayActivityResponse['type'],
    title,
    detail,
    timestamp,
    channel: firstString(record?.channel) as GatewayActivityResponse['channel'],
    runId: firstString(record?.runId) ?? null,
    incidentId: firstString(record?.incidentId) ?? null,
    severity: firstString(record?.severity) as GatewayActivityResponse['severity'],
  } satisfies GatewayActivityResponse;
}

export function normalizeAgentPayload(
  value: unknown,
  fallback?: GatewayAgentResponse
): GatewayAgentResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.agentId) ?? fallback?.id;

  if (!id) {
    return null;
  }

  const conversationId = extractSessionKey(record) ?? fallback?.conversationId ?? null;
  const status = normalizeAgentStatus(
    firstString(record?.status, record?.state, record?.presence) ?? fallback?.status
  );

  return {
    id,
    name: firstString(record?.name, record?.agentName, record?.label) ?? fallback?.name ?? id,
    avatar: firstString(record?.avatar, record?.emoji) ?? fallback?.avatar ?? null,
    status,
    model: firstString(record?.model, record?.modelName) ?? fallback?.model ?? 'unknown',
    provider:
      firstString(record?.provider, record?.vendor) ?? fallback?.provider ?? 'unknown',
    description:
      firstString(record?.description, record?.summary) ??
      fallback?.description ??
      'Operational agent',
    agentDir: firstString(record?.agentDir, record?.path) ?? fallback?.agentDir ?? '',
    lastActivityAt:
      firstString(
        record?.lastActivityAt,
        record?.updatedAt,
        record?.lastSeenAt,
        record?.timestamp
      ) ??
      fallback?.lastActivityAt ??
      new Date().toISOString(),
    role: normalizeAgentRole(record, fallback),
    specialistType:
      firstString(record?.specialistType, record?.kind) ??
      fallback?.specialistType ??
      null,
    isCoordinator:
      firstBoolean(record?.isCoordinator) ??
      (firstString(record?.role) === 'coordinator'
        ? true
        : (fallback?.isCoordinator ?? false)),
    channels: normalizeChannels(record?.channels) ?? fallback?.channels?.map(cloneChannel) ?? [],
    currentRun: normalizeRunPayload(record?.currentRun ?? record?.run ?? record?.latestRun, {
      agentId: id,
      conversationId,
    }),
    allowedActions:
      normalizeStringArray(record?.allowedActions) ??
      fallback?.allowedActions?.slice() ??
      [],
    conversationId,
    metadata: {
      ...(fallback?.metadata ?? {}),
      ...(record ?? {}),
    },
  };
}

function normalizeAgentRole(
  record: Record<string, unknown> | null | undefined,
  fallback?: GatewayAgentResponse
) {
  const role = firstString(record?.role);

  if (role === 'coordinator' || role === 'specialist') {
    return role;
  }

  if (firstBoolean(record?.isCoordinator)) {
    return 'coordinator';
  }

  return fallback?.role ?? 'specialist';
}

function normalizeChannels(value: unknown) {
  const items = getArray(value);

  if (!items) {
    return null;
  }

  return items
    .map((entry) => {
      const record = asRecord(entry);
      const id = firstString(record?.id, record?.channelId);
      const type = firstString(record?.type);

      if (!id || !type) {
        return null;
      }

      return {
        id,
        type: type as ChannelType,
        identifier: firstString(record?.identifier, record?.handle) ?? '',
        label: firstString(record?.label, record?.name) ?? type,
        connected: firstBoolean(record?.connected) ?? false,
      };
    })
    .filter(
      (
        channel
      ): channel is {
        id: string;
        type: ChannelType;
        identifier: string;
        label: string;
        connected: boolean;
      } => Boolean(channel)
    );
}

export function normalizeRunPayload(
  value: unknown,
  fallback?: Partial<GatewayRunResponse>
): GatewayRunResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.runId) ?? fallback?.id;

  if (!id) {
    return null;
  }

  const createdAt =
    firstString(record?.createdAt, record?.timestamp, record?.startedAt, record?.updatedAt) ??
    fallback?.createdAt ??
    new Date().toISOString();
  const status = normalizeRunStatus(
    firstString(record?.status, record?.state) ?? fallback?.status ?? 'queued'
  );

  return {
    id,
    agentId: firstString(record?.agentId) ?? fallback?.agentId ?? '',
    agentName: firstString(record?.agentName) ?? fallback?.agentName ?? '',
    conversationId:
      firstString(record?.conversationId, record?.sessionKey) ??
      fallback?.conversationId ??
      null,
    status,
    title: firstString(record?.title, record?.name) ?? fallback?.title ?? 'Untitled run',
    summary:
      firstString(record?.summary, record?.description, record?.message) ??
      fallback?.summary ??
      (status === 'failed'
        ? 'Run failed.'
        : status === 'running'
          ? 'Run in progress.'
          : 'Recent run.'),
    createdAt,
    startedAt: firstString(record?.startedAt) ?? fallback?.startedAt ?? null,
    updatedAt:
      firstString(record?.updatedAt, record?.completedAt) ?? fallback?.updatedAt ?? createdAt,
    completedAt: firstString(record?.completedAt) ?? fallback?.completedAt ?? null,
    durationMs: firstNumber(record?.durationMs) ?? fallback?.durationMs ?? null,
    errorMessage:
      firstString(record?.errorMessage, record?.error) ?? fallback?.errorMessage ?? null,
    incidentId: firstString(record?.incidentId) ?? fallback?.incidentId ?? null,
    auditId: firstString(record?.auditId) ?? fallback?.auditId ?? null,
    delegatedAgentIds:
      normalizeStringArray(record?.delegatedAgentIds) ??
      fallback?.delegatedAgentIds?.slice() ??
      [],
    delegatedAgentNames:
      normalizeStringArray(record?.delegatedAgentNames) ??
      fallback?.delegatedAgentNames?.slice() ??
      [],
    canRetry: firstBoolean(record?.canRetry) ?? fallback?.canRetry ?? false,
    metadata: {
      ...(fallback?.metadata ?? {}),
      ...(record ?? {}),
    },
  };
}

export function normalizeIncidentPayload(
  value: unknown,
  fallback?: GatewayIncidentResponse
): GatewayIncidentResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.incidentId) ?? fallback?.id;

  if (!id) {
    return null;
  }

  const createdAt =
    firstString(record?.createdAt, record?.timestamp) ??
    fallback?.createdAt ??
    new Date().toISOString();

  return {
    id,
    title: firstString(record?.title, record?.name) ?? fallback?.title ?? 'Incident',
    summary:
      firstString(record?.summary, record?.message, record?.description) ??
      fallback?.summary ??
      'Operator attention required.',
    severity: normalizeIncidentSeverity(firstString(record?.severity) ?? fallback?.severity),
    status: normalizeIncidentStatus(firstString(record?.status, record?.state) ?? fallback?.status),
    createdAt,
    updatedAt:
      firstString(record?.updatedAt, record?.resolvedAt) ?? fallback?.updatedAt ?? createdAt,
    resolvedAt: firstString(record?.resolvedAt) ?? fallback?.resolvedAt ?? null,
    agentId: firstString(record?.agentId) ?? fallback?.agentId ?? null,
    agentName: firstString(record?.agentName) ?? fallback?.agentName ?? '',
    runId: firstString(record?.runId) ?? fallback?.runId ?? null,
    conversationId:
      firstString(record?.conversationId, record?.sessionKey) ??
      fallback?.conversationId ??
      null,
    auditId: firstString(record?.auditId) ?? fallback?.auditId ?? null,
    metadata: {
      ...(fallback?.metadata ?? {}),
      ...(record ?? {}),
    },
  };
}

export function normalizeConversationHistory(
  payload: unknown,
  sessionKey: string,
  fallbackAgentId: string
): GatewayConversationResponse {
  const record = asRecord(payload) ?? {};
  const messages = (getArray(record.messages) ?? [])
    .map((entry) => normalizeConversationMessage(entry, fallbackAgentId, sessionKey))
    .filter((message): message is GatewayConversationMessageResponse => Boolean(message));

  return {
    id: sessionKey,
    agentId: firstString(record.agentId, asRecord(record.agent)?.id) ?? fallbackAgentId,
    agentName: firstString(record.agentName, asRecord(record.agent)?.name) ?? undefined,
    messages: sortConversationMessages(messages),
    events: [],
    latestRun: normalizeRunPayload(record.latestRun, {
      agentId: fallbackAgentId,
      conversationId: sessionKey,
    }),
    nextCursor:
      firstString(record.nextCursor, record.cursor) ??
      (messages.length > 0 ? messages[messages.length - 1]?.createdAt : null) ??
      null,
  };
}

export function normalizeConversationMessage(
  value: unknown,
  fallbackAgentId: string,
  sessionKey: string,
  fallbackRole: GatewayConversationMessageResponse['role'] = 'assistant'
): GatewayConversationMessageResponse | null {
  const record = asRecord(value);
  const id = firstString(record?.id, record?.messageId) ?? `message:${createId()}`;
  const content =
    firstString(record?.content, record?.text, record?.delta) ??
    (typeof value === 'string' ? value : '');

  return {
    id,
    agentId: firstString(record?.agentId) ?? fallbackAgentId,
    role: normalizeMessageRole(firstString(record?.role) ?? fallbackRole),
    content,
    createdAt: firstString(record?.createdAt, record?.timestamp) ?? new Date().toISOString(),
    conversationId:
      firstString(record?.conversationId, record?.sessionKey) ?? sessionKey,
    runId: firstString(record?.runId) ?? null,
    status: normalizeMessageStatus(firstString(record?.status)),
    metadata: {
      ...(record ?? {}),
    },
  };
}

function normalizeAgentIdentityPayload(payload: unknown, fallbackAgentId: string) {
  const record = asRecord(payload);

  return {
    agentId: firstString(record?.agentId, record?.id) ?? fallbackAgentId,
    name: firstString(record?.name, record?.agentName, record?.label) ?? fallbackAgentId,
    avatar: firstString(record?.avatar, record?.emoji) ?? null,
  };
}

function normalizeAgentsListPayload(payload: unknown) {
  const record = asRecord(payload);
  const items = getArray(record?.agents) ?? (Array.isArray(payload) ? payload : []);

  return {
    defaultId: firstString(record?.defaultId, record?.defaultAgentId) ?? null,
    agents: items
      .map((entry) => {
        const agentRecord = asRecord(entry);

        return {
          id: firstString(agentRecord?.id, agentRecord?.agentId),
        };
      })
      .filter((entry): entry is { id: string } => Boolean(entry.id)),
  };
}

function normalizeSessionsListPayload(payload: unknown) {
  const record = asRecord(payload);
  const items =
    getArray(record?.sessions) ??
    getArray(record?.items) ??
    (Array.isArray(payload) ? payload : []);

  return items
    .map((entry) => normalizeSessionPayload(entry))
    .filter((session): session is GatewaySessionSnapshot => Boolean(session));
}

export function normalizeSessionPayload(
  value: unknown,
  fallback: Partial<GatewaySessionSnapshot> = {}
): GatewaySessionSnapshot | null {
  const record = asRecord(value);
  const sessionKey =
    firstString(
      record?.sessionKey,
      record?.id,
      record?.conversationId,
      record?.conversationKey,
      record?.threadId
    ) ?? fallback.sessionKey;
  const agentRecord = asRecord(record?.agent);
  const agentId =
    firstString(record?.agentId, agentRecord?.id) ??
    parseAgentIdFromSessionKey(sessionKey) ??
    fallback.agentId;

  if (!sessionKey || !agentId) {
    return null;
  }

  const channelRecord = asRecord(record?.channel);
  const createdAt =
    firstString(record?.createdAt, record?.startedAt, record?.updatedAt, record?.lastMessageAt) ??
    fallback.createdAt ??
    new Date().toISOString();
  const updatedAt =
    firstString(
      record?.updatedAt,
      record?.lastMessageAt,
      record?.lastActivityAt,
      record?.createdAt
    ) ??
    fallback.updatedAt ??
    createdAt;

  return {
    sessionKey,
    agentId,
    agentName: firstString(record?.agentName, agentRecord?.name) ?? fallback.agentName,
    status: normalizeSessionStatus(
      firstString(
        record?.status,
        record?.state,
        record?.runStatus,
        asRecord(record?.run)?.status,
        asRecord(record?.latestRun)?.status
      ),
      record,
      fallback.status
    ),
    createdAt,
    updatedAt,
    model:
      firstString(
        record?.model,
        record?.modelName,
        asRecord(record?.usage)?.model,
        asRecord(record?.latestRun)?.model
      ) ?? fallback.model,
    provider:
      firstString(
        record?.provider,
        record?.vendor,
        record?.modelProvider,
        asRecord(record?.usage)?.provider
      ) ?? fallback.provider,
    channelType:
      firstString(channelRecord?.type, record?.channelType) ??
      fallback.channelType ??
      inferChannelTypeFromSessionKey(sessionKey),
    channelLabel:
      firstString(channelRecord?.label, channelRecord?.name, record?.channelLabel) ??
      fallback.channelLabel ??
      inferChannelLabelFromSessionKey(sessionKey),
    channelIdentifier:
      firstString(channelRecord?.identifier, channelRecord?.id, record?.channelId) ??
      fallback.channelIdentifier ??
      null,
    connected:
      firstBoolean(channelRecord?.connected, record?.connected, record?.active) ??
      fallback.connected,
    messageCount:
      firstNumber(record?.messageCount, record?.messagesCount, asRecord(record?.stats)?.messageCount) ??
      fallback.messageCount ??
      null,
    tokenCount:
      firstNumber(
        record?.tokenCount,
        record?.tokens,
        asRecord(record?.usage)?.totalTokens,
        asRecord(record?.stats)?.tokenCount
      ) ??
      fallback.tokenCount ??
      null,
    promptTokens:
      firstNumber(record?.promptTokens, asRecord(record?.usage)?.promptTokens) ??
      fallback.promptTokens ??
      null,
    completionTokens:
      firstNumber(record?.completionTokens, asRecord(record?.usage)?.completionTokens) ??
      fallback.completionTokens ??
      null,
    metadata: {
      ...(fallback.metadata ?? {}),
      ...(record ?? {}),
    },
  };
}

export function normalizeNodePayload(
  value: Record<string, unknown> | null | undefined
) {
  if (!value) {
    return null;
  }

  const agentRecord = asRecord(value.agent);
  const id =
    firstString(
      value.id,
      value.nodeId,
      value.instanceId,
      value.host,
      value.hostname,
      value.ip,
      agentRecord?.id
    ) ?? null;

  if (!id) {
    return null;
  }

  return {
    id,
    label: firstString(value.label, value.name, value.host, value.hostname, value.ip) ?? id,
    status: firstString(value.status, value.state, value.presence) ?? 'unknown',
    lastSeenAt: firstString(value.lastSeenAt, value.updatedAt, value.timestamp) ?? null,
    metadata: {
      ...(value ?? {}),
    },
  } satisfies GatewayNodeSnapshot;
}

export function createEmptyConversationResponse(
  agentId?: string,
  conversationId?: string
) {
  return {
    id: conversationId ?? `pending:${agentId ?? 'conversation'}`,
    agentId: agentId ?? '',
    messages: [],
    events: [],
    latestRun: null,
    nextCursor: null,
  } satisfies GatewayConversationResponse;
}

function resolveOutgoingSessionKey(
  input: Pick<SendMessageInput, 'agentId' | 'conversationId'>,
  snapshot: SnapshotState
) {
  if (input.conversationId && !input.conversationId.startsWith('pending:')) {
    return input.conversationId;
  }

  if (input.agentId) {
    return resolveDefaultSessionKeyForAgent(input.agentId, snapshot);
  }

  return null;
}

function mergeAgent(current: GatewayAgentResponse | undefined, next: GatewayAgentResponse) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    channels: next.channels?.length
      ? next.channels.map(cloneChannel)
      : (current.channels ?? []).map(cloneChannel),
    currentRun: next.currentRun ?? current.currentRun ?? null,
    allowedActions: next.allowedActions?.length
      ? next.allowedActions.slice()
      : current.allowedActions?.slice(),
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function mergeRun(current: GatewayRunResponse | undefined, next: GatewayRunResponse) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    delegatedAgentIds: next.delegatedAgentIds?.length
      ? next.delegatedAgentIds.slice()
      : current.delegatedAgentIds?.slice(),
    delegatedAgentNames: next.delegatedAgentNames?.length
      ? next.delegatedAgentNames.slice()
      : current.delegatedAgentNames?.slice(),
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function mergeIncident(
  current: GatewayIncidentResponse | undefined,
  next: GatewayIncidentResponse
) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function mergeConversation(
  current: GatewayConversationResponse | undefined,
  next: GatewayConversationResponse
) {
  if (!current) {
    return {
      ...next,
      messages: sortConversationMessages(next.messages.map(cloneMessage)),
      events: next.events?.slice() ?? [],
    };
  }

  const messages = new Map<string, GatewayConversationMessageResponse>();
  [...current.messages, ...next.messages].forEach((message) => {
    const existing = messages.get(message.id);
    messages.set(message.id, mergeConversationMessage(existing, message));
  });

  return {
    ...current,
    ...next,
    messages: sortConversationMessages([...messages.values()].map(cloneMessage)),
    events: next.events?.length ? next.events.slice() : current.events?.slice() ?? [],
    latestRun: next.latestRun ?? current.latestRun ?? null,
    nextCursor: next.nextCursor ?? current.nextCursor ?? null,
  };
}

function mergeConversationMessage(
  current: GatewayConversationMessageResponse | undefined,
  next: GatewayConversationMessageResponse
) {
  if (!current) {
    return next;
  }

  const nextStatus = normalizeMessageStatus(next.status) ?? current.status;

  return {
    ...current,
    ...next,
    content: next.content.length >= current.content.length ? next.content : current.content,
    status: nextStatus,
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function mergeSessionSnapshot(
  current: GatewaySessionSnapshot | undefined,
  next: GatewaySessionSnapshot
) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    metadata: {
      ...(current.metadata ?? {}),
      ...(next.metadata ?? {}),
    },
  };
}

function compareSessionPreference(left: GatewaySessionSnapshot, right: GatewaySessionSnapshot) {
  const leftRank = sessionPreferenceRank(left);
  const rightRank = sessionPreferenceRank(right);

  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function sessionPreferenceRank(session: GatewaySessionSnapshot) {
  if (session.channelType === 'main' || session.channelType === 'direct') {
    return 0;
  }

  if (session.status === 'running' || session.status === 'queued') {
    return 1;
  }

  return 2;
}

function sessionToRun(
  session: GatewaySessionSnapshot,
  fallback: Partial<GatewayRunResponse> = {}
): GatewayRunResponse {
  const title =
    firstString(session.metadata.title, session.metadata.name, session.metadata.subject) ??
    (session.channelLabel
      ? `${session.channelLabel} session`
      : session.channelType === 'main' || session.channelType === 'direct'
        ? 'Direct session'
        : 'Session activity');

  return (
    normalizeRunPayload(
      {
        id:
          firstString(session.metadata.runId, session.metadata.id, session.sessionKey) ??
          session.sessionKey,
        runId: firstString(session.metadata.runId),
        agentId: session.agentId,
        agentName: session.agentName ?? fallback.agentName,
        sessionKey: session.sessionKey,
        status: session.status,
        title,
        summary:
          firstString(
            session.metadata.summary,
            session.metadata.description,
            session.metadata.lastMessage,
            session.metadata.preview
          ) ??
          (session.status === 'failed'
            ? 'Recent session failed.'
            : session.status === 'running' || session.status === 'queued'
              ? 'Session is active.'
              : 'Recent session activity.'),
        createdAt: session.createdAt,
        startedAt: session.createdAt,
        updatedAt: session.updatedAt,
        durationMs: firstNumber(session.metadata.durationMs) ?? null,
        errorMessage:
          firstString(session.metadata.errorMessage, session.metadata.error) ?? null,
        tokens: session.tokenCount ?? undefined,
        metadata: {
          ...session.metadata,
          sessionKey: session.sessionKey,
          channelType: session.channelType,
          channelLabel: session.channelLabel,
          channelIdentifier: session.channelIdentifier,
          tokenCount: session.tokenCount,
          promptTokens: session.promptTokens,
          completionTokens: session.completionTokens,
          messageCount: session.messageCount,
        },
      },
      fallback
    ) ?? {
      id: session.sessionKey,
      agentId: session.agentId,
      agentName: session.agentName ?? fallback.agentName ?? '',
      conversationId: session.sessionKey,
      status: session.status,
      title,
      summary: 'Recent session activity.',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      metadata: {
        ...session.metadata,
        sessionKey: session.sessionKey,
      },
    }
  );
}

function resolveDefaultSessionKeyForAgent(agentId: string, snapshot: SnapshotState) {
  return (
    snapshot.sessionKeyByAgentId.get(agentId) ?? constructDefaultDirectSessionKey(agentId)
  );
}

function constructDefaultDirectSessionKey(agentId: string) {
  return `agent:${agentId}:main`;
}

function parseAgentIdFromSessionKey(sessionKey: string | null | undefined) {
  if (!sessionKey) {
    return null;
  }

  const match = /^agent:([^:]+):/u.exec(sessionKey);
  return match?.[1] ?? null;
}

function inferChannelTypeFromSessionKey(sessionKey: string) {
  const parts = sessionKey.split(':');

  if (parts.length < 3) {
    return null;
  }

  return parts[2] ?? null;
}

function inferChannelLabelFromSessionKey(sessionKey: string) {
  const channelType = inferChannelTypeFromSessionKey(sessionKey);

  if (!channelType) {
    return null;
  }

  if (channelType === 'main') {
    return 'Direct';
  }

  return channelType;
}

function cloneSessionSnapshot(session: GatewaySessionSnapshot): GatewaySessionSnapshot {
  return {
    ...session,
    metadata: { ...session.metadata },
  };
}

function createEmptySnapshotState(): SnapshotState {
  return {
    overview: null,
    agentsById: new Map(),
    defaultAgentId: null,
    sessionKeyByAgentId: new Map(),
    agentIdBySessionKey: new Map(),
    sessionsByKey: new Map(),
    conversationsBySessionKey: new Map(),
    runsById: new Map(),
    incidentsById: new Map(),
    nodesById: new Map(),
  };
}

function ensureConversation(
  current: GatewayConversationResponse | undefined,
  base: Pick<GatewayConversationResponse, 'id' | 'agentId' | 'agentName'>
) {
  return (
    current ?? {
      id: base.id,
      agentId: base.agentId,
      agentName: base.agentName,
      messages: [],
      events: [],
      latestRun: null,
      nextCursor: null,
    }
  );
}

export function createAssistantMessage(input: {
  id: string;
  agentId: string;
  conversationId: string;
  runId?: string | null;
  content: string;
  status: GatewayConversationMessageResponse['status'];
}) {
  return {
    id: input.id,
    agentId: input.agentId,
    role: 'assistant' as const,
    content: input.content,
    createdAt: new Date().toISOString(),
    conversationId: input.conversationId,
    runId: input.runId ?? null,
    status: input.status,
    metadata: {},
  };
}

function mergeAgentChannels(
  channels: GatewayAgentResponse['channels'] | undefined,
  sessions: GatewaySessionSnapshot[]
) {
  const byId = new Map<string, NonNullable<GatewayAgentResponse['channels']>[number]>();

  (channels ?? []).forEach((channel) => {
    byId.set(channel.id, cloneChannel(channel));
  });

  sessions.forEach((session) => {
    const channelId =
      session.channelIdentifier ??
      session.channelLabel ??
      session.channelType ??
      session.sessionKey;
    const channelType = normalizeChannelType(session.channelType);

    if (!channelId || !channelType) {
      return;
    }

    byId.set(channelId, {
      id: channelId,
      type: channelType,
      identifier: session.channelIdentifier ?? channelId,
      label: session.channelLabel ?? channelType,
      connected:
        session.connected ?? (session.status === 'running' || session.status === 'queued'),
    });
  });

  return [...byId.values()];
}

function deriveAgentStatus(
  agent: GatewayAgentResponse,
  sessions: GatewaySessionSnapshot[]
): AgentStatus {
  if (sessions.some((session) => session.status === 'running' || session.status === 'queued')) {
    return 'busy';
  }

  const latestSession = sessions[0];
  if (latestSession?.status === 'failed' || latestSession?.status === 'degraded') {
    return 'degraded';
  }

  if (sessions.length > 0) {
    return 'online';
  }

  return agent.status ?? 'offline';
}

function sortAgents(items: GatewayAgentResponse[]) {
  return items.sort((left, right) => {
    const leftRank = left.isCoordinator || left.role === 'coordinator' ? 0 : 1;
    const rightRank = right.isCoordinator || right.role === 'coordinator' ? 0 : 1;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.name.localeCompare(right.name);
  });
}

function sortSessionSnapshots(items: GatewaySessionSnapshot[]) {
  return items.sort((left, right) => {
    const leftTime = left.updatedAt;
    const rightTime = right.updatedAt;
    return rightTime > leftTime ? 1 : rightTime < leftTime ? -1 : 0;
  });
}

function sortRuns(items: GatewayRunResponse[]) {
  return items.sort((left, right) => {
    const leftTime = left.updatedAt ?? left.createdAt;
    const rightTime = right.updatedAt ?? right.createdAt;
    return rightTime > leftTime ? 1 : rightTime < leftTime ? -1 : 0;
  });
}

function sortIncidents(items: GatewayIncidentResponse[]) {
  return items.sort((left, right) => {
    const leftTime = left.updatedAt ?? left.createdAt;
    const rightTime = right.updatedAt ?? right.createdAt;
    return rightTime > leftTime ? 1 : rightTime < leftTime ? -1 : 0;
  });
}

function sortConversationMessages(items: GatewayConversationMessageResponse[]) {
  return items.sort((left, right) => {
    const leftTime = left.createdAt;
    const rightTime = right.createdAt;

    if (leftTime !== rightTime) {
      return leftTime > rightTime ? 1 : -1;
    }

    return left.id.localeCompare(right.id);
  });
}

function filterAgents(items: GatewayAgentResponse[], query?: AgentQuery) {
  return items.filter((agent) => {
    const matchesStatus = !query?.status
      ? true
      : Array.isArray(query.status)
        ? query.status.includes(agent.status)
        : agent.status === query.status;
    const matchesSearch = !query?.search
      ? true
      : [agent.name, agent.model ?? '', agent.provider ?? '', agent.description ?? '']
          .join(' ')
          .toLowerCase()
          .includes(query.search.toLowerCase());
    const includeCoordinator = query?.includeCoordinator ?? true;
    const matchesCoordinator = includeCoordinator ? true : !agent.isCoordinator;

    return matchesStatus && matchesSearch && matchesCoordinator;
  });
}

function filterRuns(items: GatewayRunResponse[], query?: RunsQuery) {
  const filtered = items.filter((run) => {
    const matchesStatus = !query?.status
      ? true
      : Array.isArray(query.status)
        ? query.status.includes(run.status)
        : run.status === query.status;
    const matchesAgent = !query?.agentId || run.agentId === query.agentId;
    const matchesConversation =
      !query?.conversationId || run.conversationId === query.conversationId;

    return matchesStatus && matchesAgent && matchesConversation;
  });

  return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
}

function filterIncidents(items: GatewayIncidentResponse[], query?: IncidentsQuery) {
  const filtered = items.filter((incident) => {
    const matchesStatus = !query?.status
      ? true
      : Array.isArray(query.status)
        ? query.status.includes(incident.status)
        : incident.status === query.status;
    const matchesSeverity = !query?.severity
      ? true
      : Array.isArray(query.severity)
        ? query.severity.includes(incident.severity)
        : incident.severity === query.severity;
    const matchesAgent = !query?.agentId || incident.agentId === query.agentId;
    const matchesRun = !query?.runId || incident.runId === query.runId;

    return matchesStatus && matchesSeverity && matchesAgent && matchesRun;
  });

  return typeof query?.limit === 'number' ? filtered.slice(0, query.limit) : filtered;
}

export function collectNormalizedRuns(value: unknown) {
  const items = getArray(value);

  if (items) {
    return items
      .map((entry) => normalizeRunPayload(entry))
      .filter((run): run is GatewayRunResponse => Boolean(run));
  }

  const directRun = normalizeRunPayload(value);
  return directRun ? [directRun] : [];
}

export function collectNormalizedIncidents(value: unknown) {
  const items = getArray(value);

  if (items) {
    return items
      .map((entry) => normalizeIncidentPayload(entry))
      .filter((incident): incident is GatewayIncidentResponse => Boolean(incident));
  }

  const directIncident = normalizeIncidentPayload(value);
  return directIncident ? [directIncident] : [];
}

export function extractSessionKey(record: Record<string, unknown> | null | undefined) {
  return firstString(
    record?.sessionKey,
    record?.conversationId,
    record?.conversationKey,
    record?.threadId,
    asRecord(record?.session)?.key,
    asRecord(record?.session)?.id
  );
}

function normalizeSessionStatus(
  value: string | undefined,
  record: Record<string, unknown> | null | undefined,
  fallback: GatewaySessionSnapshot['status'] | undefined
) {
  if (value) {
    if (value === 'active' || value === 'streaming' || value === 'processing') {
      return 'running';
    }

    if (value === 'idle' || value === 'connected') {
      return 'succeeded';
    }
  }

  if (firstBoolean(record?.active, record?.connected, record?.isActive)) {
    return 'running';
  }

  if (firstString(record?.errorMessage, record?.error)) {
    return 'failed';
  }

  return normalizeRunStatus(value ?? fallback ?? 'succeeded');
}

function normalizeAgentStatus(value: string | AgentStatus | undefined) {
  switch (value) {
    case 'online':
    case 'busy':
    case 'degraded':
    case 'offline':
      return value;
    case 'active':
    case 'ready':
      return 'online';
    case 'idle':
      return 'busy';
    case 'error':
      return 'degraded';
    default:
      return 'offline';
  }
}

function normalizeChannelType(value: string | null | undefined) {
  switch (value) {
    case 'discord':
    case 'telegram':
    case 'whatsapp':
    case 'imessage':
      return value;
    default:
      return null;
  }
}

function normalizeRunStatus(value: string | undefined) {
  switch (value) {
    case 'queued':
    case 'running':
    case 'succeeded':
    case 'failed':
    case 'cancelled':
    case 'degraded':
      return value;
    case 'complete':
    case 'completed':
    case 'success':
      return 'succeeded';
    case 'error':
      return 'failed';
    default:
      return 'queued';
  }
}

function normalizeIncidentSeverity(value: string | undefined) {
  switch (value) {
    case 'info':
    case 'warning':
    case 'critical':
      return value;
    case 'error':
      return 'critical';
    default:
      return 'warning';
  }
}

function normalizeIncidentStatus(value: string | undefined) {
  switch (value) {
    case 'open':
    case 'acknowledged':
    case 'resolved':
      return value;
    case 'closed':
      return 'resolved';
    default:
      return 'open';
  }
}

function normalizeMessageRole(value: string | undefined) {
  switch (value) {
    case 'user':
    case 'assistant':
    case 'system':
    case 'tool':
    case 'event':
      return value;
    default:
      return 'assistant';
  }
}

function normalizeMessageStatus(value: string | undefined) {
  switch (value) {
    case 'pending':
    case 'streaming':
    case 'complete':
    case 'failed':
      return value;
    default:
      return undefined;
  }
}

export function mapChatStateToRunStatus(value: string) {
  switch (value) {
    case 'delta':
      return 'running';
    case 'final':
      return 'succeeded';
    case 'aborted':
      return 'cancelled';
    case 'error':
      return 'failed';
    default:
      return 'running';
  }
}

function cloneOverview(overview: GatewayOverviewResponse): GatewayOverviewResponse {
  return {
    ...overview,
    gateway: { ...overview.gateway },
    session: overview.session
      ? {
          ...overview.session,
          metadata: overview.session.metadata
            ? { ...overview.session.metadata }
            : overview.session.metadata,
        }
      : overview.session,
    stats: overview.stats ? { ...overview.stats } : overview.stats,
    coordinator: overview.coordinator ? cloneAgent(overview.coordinator) : overview.coordinator,
    agents: overview.agents.map(cloneAgent),
    recentRuns: overview.recentRuns?.map(cloneRun),
    incidents: overview.incidents?.map(cloneIncident),
    activity: overview.activity?.map((entry) => ({ ...entry })),
  };
}

function cloneAgent(agent: GatewayAgentResponse): GatewayAgentResponse {
  return {
    ...agent,
    channels: agent.channels?.map(cloneChannel) ?? [],
    currentRun: agent.currentRun ? cloneRun(agent.currentRun) : agent.currentRun,
    allowedActions: agent.allowedActions?.slice(),
    metadata: agent.metadata ? { ...agent.metadata } : agent.metadata,
  };
}

function cloneChannel(channel: NonNullable<GatewayAgentResponse['channels']>[number]) {
  return {
    ...channel,
  };
}

function cloneRun(run: GatewayRunResponse): GatewayRunResponse {
  return {
    ...run,
    delegatedAgentIds: run.delegatedAgentIds?.slice(),
    delegatedAgentNames: run.delegatedAgentNames?.slice(),
    metadata: run.metadata ? { ...run.metadata } : run.metadata,
  };
}

function cloneIncident(incident: GatewayIncidentResponse): GatewayIncidentResponse {
  return {
    ...incident,
    metadata: incident.metadata ? { ...incident.metadata } : incident.metadata,
  };
}

function cloneConversation(
  conversation: GatewayConversationResponse
): GatewayConversationResponse {
  return {
    ...conversation,
    messages: conversation.messages.map(cloneMessage),
    events: conversation.events?.slice() ?? [],
    latestRun: conversation.latestRun ? cloneRun(conversation.latestRun) : conversation.latestRun,
  };
}

function cloneMessage(
  message: GatewayConversationMessageResponse
): GatewayConversationMessageResponse {
  return {
    ...message,
    metadata: message.metadata ? { ...message.metadata } : message.metadata,
  };
}
