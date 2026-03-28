import { describe, expect, it } from "bun:test";
import { mapAgentSummary } from "./mappers";
import type { GatewayAgentResponse } from "@/types/openclaw";

describe("mapAgentSummary", () => {
  const mockRawAgent: GatewayAgentResponse = {
    id: "agent-1",
    name: "Test Agent",
    status: "online",
    model: "gpt-4",
    provider: "openai",
    lastActivityAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
    description: " A test agent description ",
    agentDir: "/path/to/agent",
    role: "specialist",
    specialistType: "coder",
    isCoordinator: false,
    channels: [
      { id: "ch-1", type: "whatsapp", identifier: "123", connected: true }
    ],
    metadata: { key: "value" }
  };

  it("should map all fields correctly from a complete response", () => {
    const result = mapAgentSummary(mockRawAgent);

    expect(result.id).toBe(mockRawAgent.id);
    expect(result.name).toBe(mockRawAgent.name);
    expect(result.status).toBe("online");
    expect(result.model).toBe("gpt-4");
    expect(result.provider).toBe("openai");
    expect(result.lastActivity).toBe("5m ago");
    expect(result.description).toBe("A test agent description");
    expect(result.agentDir).toBe("/path/to/agent");
    expect(result.role).toBe("specialist");
    expect(result.specialistType).toBe("coder");
    expect(result.isCoordinator).toBe(false);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0].id).toBe("ch-1");
    expect(result.metadata).toEqual({ key: "value" });
  });

  it("should handle missing optional fields with defaults", () => {
    const minimalRawAgent: GatewayAgentResponse = {
      id: "agent-2",
      name: "Minimal Agent",
      status: "online",
    };

    const result = mapAgentSummary(minimalRawAgent);

    expect(result.avatar).toBeNull();
    expect(result.model).toBe("unknown");
    expect(result.provider).toBe("unknown");
    expect(result.channels).toEqual([]);
    expect(result.lastActivity).toBe("Never");
    expect(result.description).toBe("Operational specialist");
    expect(result.role).toBe("specialist");
    expect(result.isCoordinator).toBe(false);
    expect(result.conversationId).toBeNull();
    expect(result.lastRun).toBeNull();
    expect(result.allowedActions).toEqual([]);
  });

  it("should use fallback description for coordinator agents", () => {
    const coordinatorRaw: GatewayAgentResponse = {
      id: "agent-3",
      name: "Coordinator Agent",
      status: "online",
      isCoordinator: true,
    };

    const result = mapAgentSummary(coordinatorRaw);
    expect(result.description).toBe("Primary coordinator agent");
    expect(result.role).toBe("coordinator");
    expect(result.isCoordinator).toBe(true);
  });

  it("should use fallback description for specialist types", () => {
    const specialistRaw: GatewayAgentResponse = {
      id: "agent-4",
      name: "Specialist Agent",
      status: "online",
      specialistType: "researcher",
    };

    const result = mapAgentSummary(specialistRaw);
    expect(result.description).toBe("researcher specialist");
  });

  it("should format lastActivity as 'Just now' for very recent timestamps", () => {
    const recentRaw: GatewayAgentResponse = {
      id: "agent-5",
      name: "Recent Agent",
      status: "online",
      lastActivityAt: new Date().toISOString(),
    };

    const result = mapAgentSummary(recentRaw);
    expect(result.lastActivity).toBe("Just now");
  });

  it("should format lastActivity as 'Xd ago' for older timestamps", () => {
    const oldRaw: GatewayAgentResponse = {
      id: "agent-6",
      name: "Old Agent",
      status: "online",
      lastActivityAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const result = mapAgentSummary(oldRaw);
    expect(result.lastActivity).toBe("3d ago");
  });

  it("should fallback isCoordinator based on role if missing", () => {
    const raw: GatewayAgentResponse = {
      id: "agent-7",
      name: "Mixed Agent",
      status: "online",
      role: "coordinator",
      // isCoordinator missing
    };

    const result = mapAgentSummary(raw);
    expect(result.role).toBe("coordinator");
    expect(result.isCoordinator).toBe(true);
  });

  it("should respect explicit isCoordinator: false even if role is coordinator", () => {
    const raw: GatewayAgentResponse = {
      id: "agent-8",
      name: "Explicit Agent",
      status: "online",
      role: "coordinator",
      isCoordinator: false,
    };

    const result = mapAgentSummary(raw);
    expect(result.isCoordinator).toBe(false);
  });
});
