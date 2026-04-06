import { describe, expect, it, test, setSystemTime } from 'bun:test';
import { mapRunSummary, mapAgentSummary } from './mappers';
import type { GatewayRunResponse, GatewayAgentResponse } from '@/types/openclaw';

describe('mapRunSummary', () => {
  const minimalRaw: GatewayRunResponse = {
    id: 'run-1',
    agentId: 'agent-1',
    status: 'succeeded',
    createdAt: '2024-01-01T00:00:00Z',
  };

  it('maps a full GatewayRunResponse correctly', () => {
    const fullRaw: GatewayRunResponse = {
      id: 'run-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      conversationId: 'conv-1',
      status: 'failed',
      title: 'Full Run',
      summary: 'Custom summary',
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: '2024-01-01T00:00:01Z',
      updatedAt: '2024-01-01T00:00:05Z',
      completedAt: '2024-01-01T00:00:10Z',
      durationMs: 9000,
      errorMessage: 'Something went wrong',
      incidentId: 'inc-1',
      auditId: 'audit-1',
      delegatedAgentIds: ['agent-2'],
      delegatedAgentNames: ['Agent 2'],
      canRetry: true,
      metadata: { foo: 'bar' },
    };

    const result = mapRunSummary(fullRaw);

    expect(result).toEqual({
      id: 'run-1',
      agentId: 'agent-1',
      agentName: 'Test Agent',
      conversationId: 'conv-1',
      status: 'failed',
      title: 'Full Run',
      summary: 'Custom summary',
      createdAt: '2024-01-01T00:00:00Z',
      startedAt: '2024-01-01T00:00:01Z',
      updatedAt: '2024-01-01T00:00:05Z',
      completedAt: '2024-01-01T00:00:10Z',
      durationMs: 9000,
      errorMessage: 'Something went wrong',
      incidentId: 'inc-1',
      auditId: 'audit-1',
      delegatedAgentIds: ['agent-2'],
      delegatedAgentNames: ['Agent 2'],
      canRetry: true,
      metadata: { foo: 'bar' },
    });
  });

  it('provides default values for minimal input', () => {
    const result = mapRunSummary(minimalRaw);

    expect(result.agentName).toBe('');
    expect(result.title).toBe('Untitled run');
    expect(result.conversationId).toBeNull();
    expect(result.summary).toBe('Recent run');
    expect(result.startedAt).toBeNull();
    expect(result.completedAt).toBeNull();
    expect(result.durationMs).toBeNull();
    expect(result.errorMessage).toBeNull();
    expect(result.incidentId).toBeNull();
    expect(result.auditId).toBeNull();
    expect(result.delegatedAgentIds).toEqual([]);
    expect(result.delegatedAgentNames).toEqual([]);
    expect(result.canRetry).toBe(false);
  });

  describe('summary fallback logic', () => {
    it('returns "Run failed" if summary is missing but errorMessage is present', () => {
      const raw = { ...minimalRaw, status: 'failed' as const, errorMessage: 'Error' };
      const result = mapRunSummary(raw);
      expect(result.summary).toBe('Run failed');
    });

    it('returns "Run in progress" if summary is missing and status is "running"', () => {
      const raw = { ...minimalRaw, status: 'running' as const };
      const result = mapRunSummary(raw);
      expect(result.summary).toBe('Run in progress');
    });

    it('returns "Recent run" for other cases when summary is missing', () => {
      const result = mapRunSummary(minimalRaw);
      expect(result.summary).toBe('Recent run');
    });
  });

  describe('updatedAt fallback logic', () => {
    it('uses updatedAt if present', () => {
      const raw = {
        ...minimalRaw,
        updatedAt: '2024-01-01T00:00:10Z',
        completedAt: '2024-01-01T00:00:05Z',
      };
      const result = mapRunSummary(raw);
      expect(result.updatedAt).toBe('2024-01-01T00:00:10Z');
    });

    it('falls back to completedAt if updatedAt is missing', () => {
      const raw = {
        ...minimalRaw,
        completedAt: '2024-01-01T00:00:05Z',
        startedAt: '2024-01-01T00:00:01Z',
      };
      const result = mapRunSummary(raw);
      expect(result.updatedAt).toBe('2024-01-01T00:00:05Z');
    });

    it('falls back to startedAt if updatedAt and completedAt are missing', () => {
      const raw = {
        ...minimalRaw,
        startedAt: '2024-01-01T00:00:01Z',
      };
      const result = mapRunSummary(raw);
      expect(result.updatedAt).toBe('2024-01-01T00:00:01Z');
    });

    it('falls back to createdAt if all others are missing', () => {
      const result = mapRunSummary(minimalRaw);
      expect(result.updatedAt).toBe(minimalRaw.createdAt);
    });
  });

  describe('canRetry logic', () => {
    it('is true if canRetry is missing and status is "failed"', () => {
      const raw = { ...minimalRaw, status: 'failed' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('is true if canRetry is missing and status is "degraded"', () => {
      const raw = { ...minimalRaw, status: 'degraded' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('is true if canRetry is missing and status is "cancelled"', () => {
      const raw = { ...minimalRaw, status: 'cancelled' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('is false if canRetry is missing and status is "succeeded"', () => {
      const raw = { ...minimalRaw, status: 'succeeded' as const };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(false);
    });

    it('respects explicitly provided canRetry: true', () => {
      const raw = { ...minimalRaw, status: 'succeeded' as const, canRetry: true };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(true);
    });

    it('respects explicitly provided canRetry: false', () => {
      const raw = { ...minimalRaw, status: 'failed' as const, canRetry: false };
      const result = mapRunSummary(raw);
      expect(result.canRetry).toBe(false);
    });
  });
});

describe("mapAgentSummary", () => {
  const mockNow = new Date("2024-01-01T12:00:00Z");
  setSystemTime(mockNow);

  test("should map a full GatewayAgentResponse correctly", () => {
    const raw: GatewayAgentResponse = {
      id: "agent-1",
      name: "Test Agent",
      avatar: "https://example.com/avatar.png",
      status: "online",
      model: "gpt-4",
      provider: "openai",
      description: "A test agent description",
      agentDir: "/path/to/agent",
      lastActivityAt: "2024-01-01T11:50:00Z",
      role: "specialist",
      specialistType: "research",
      isCoordinator: false,
      channels: [
        { id: "ch-1", type: "whatsapp", identifier: "12345", label: "My WhatsApp", connected: true }
      ],
      currentRun: {
        id: "run-1",
        agentId: "agent-1",
        status: "running",
        title: "Active Run",
        createdAt: "2024-01-01T11:55:00Z",
      },
      allowedActions: ["restart"],
      conversationId: "conv-1",
      metadata: { key: "value" }
    };

    const result = mapAgentSummary(raw);

    expect(result).toEqual({
      id: "agent-1",
      name: "Test Agent",
      avatar: "https://example.com/avatar.png",
      status: "online",
      model: "gpt-4",
      provider: "openai",
      channels: [
        { id: "ch-1", type: "whatsapp", identifier: "12345", label: "My WhatsApp", connected: true }
      ],
      lastActivity: "10m ago",
      description: "A test agent description",
      systemPrompt: "",
      agentDir: "/path/to/agent",
      role: "specialist",
      specialistType: "research",
      isCoordinator: false,
      conversationId: "conv-1",
      lastRun: expect.objectContaining({
        id: "run-1",
        status: "running",
        title: "Active Run"
      }),
      allowedActions: ["restart"],
      metadata: { key: "value" }
    });
  });

  test("should use default values for missing optional fields", () => {
    const raw: GatewayAgentResponse = {
      id: "agent-2",
      name: "Minimal Agent",
      status: "busy"
    };

    const result = mapAgentSummary(raw);

    expect(result.avatar).toBeNull();
    expect(result.status).toBe("busy");
    expect(result.model).toBe("unknown");
    expect(result.provider).toBe("unknown");
    expect(result.channels).toEqual([]);
    expect(result.lastActivity).toBe("Never");
    expect(result.description).toBe("Operational specialist");
    expect(result.agentDir).toBe("");
    expect(result.role).toBe("specialist");
    expect(result.specialistType).toBeNull();
    expect(result.isCoordinator).toBe(false);
    expect(result.conversationId).toBeNull();
    expect(result.lastRun).toBeNull();
    expect(result.allowedActions).toEqual([]);
    expect(result.metadata).toBeUndefined();
  });

  describe("fallbackAgentDescription", () => {
    test("should return 'Primary coordinator agent' if isCoordinator is true", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", isCoordinator: true };
      expect(mapAgentSummary(raw).description).toBe("Primary coordinator agent");
    });

    test("should return 'Primary coordinator agent' if role is 'coordinator'", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", role: "coordinator" };
      expect(mapAgentSummary(raw).description).toBe("Primary coordinator agent");
    });

    test("should return specialist description if specialistType is provided", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", specialistType: "Coding" };
      expect(mapAgentSummary(raw).description).toBe("Coding specialist");
    });

    test("should return 'Operational specialist' by default", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online" };
      expect(mapAgentSummary(raw).description).toBe("Operational specialist");
    });

    test("should trim description if provided", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", description: "  Custom Description  " };
      expect(mapAgentSummary(raw).description).toBe("Custom Description");
    });
  });

  describe("formatTimeAgo", () => {
    test("should return 'Never' for null timestamp", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", lastActivityAt: null };
      expect(mapAgentSummary(raw).lastActivity).toBe("Never");
    });

    test("should return 'Just now' for very recent timestamp", () => {
      const recent = new Date(mockNow.getTime() - 30 * 1000).toISOString();
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", lastActivityAt: recent };
      expect(mapAgentSummary(raw).lastActivity).toBe("Just now");
    });

    test("should return 'Xm ago' for minutes", () => {
      const tenMins = new Date(mockNow.getTime() - 10 * 60 * 1000).toISOString();
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", lastActivityAt: tenMins };
      expect(mapAgentSummary(raw).lastActivity).toBe("10m ago");
    });

    test("should return 'Xh ago' for hours", () => {
      const fiveHours = new Date(mockNow.getTime() - 5 * 60 * 60 * 1000).toISOString();
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", lastActivityAt: fiveHours };
      expect(mapAgentSummary(raw).lastActivity).toBe("5h ago");
    });

    test("should return 'Xd ago' for days", () => {
      const threeDays = new Date(mockNow.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", lastActivityAt: threeDays };
      expect(mapAgentSummary(raw).lastActivity).toBe("3d ago");
    });
  });

  describe("role and isCoordinator logic", () => {
    test("should infer role from isCoordinator if role is missing", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", isCoordinator: true };
      const result = mapAgentSummary(raw);
      expect(result.role).toBe("coordinator");
      expect(result.isCoordinator).toBe(true);
    });

    test("should infer isCoordinator from role if isCoordinator is missing", () => {
      const raw: GatewayAgentResponse = { id: "1", name: "A", status: "online", role: "coordinator" };
      const result = mapAgentSummary(raw);
      expect(result.isCoordinator).toBe(true);
      expect(result.role).toBe("coordinator");
    });
  });
});
