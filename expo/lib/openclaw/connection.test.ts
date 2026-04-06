import { expect, test, describe } from "bun:test";
import {
  toConnectionErrorMessage,
  isUnauthorizedConnectionError,
  normalizeGatewayUrl,
  getGatewayUrlWarning,
  buildSessionFromOverview
} from "./connection";
import { OpenClawClientError } from "./client";
import type { GatewayOverviewResponse, Session } from "@/types/openclaw";

describe("toConnectionErrorMessage", () => {
  test("returns specific message for unauthorized connection errors", () => {
    const error = new OpenClawClientError("Unauthorized", { status: 401 });
    expect(toConnectionErrorMessage(error)).toBe(
      "Operator token was rejected by the gateway. Check the token and try again."
    );
  });

  test("returns specific message for REQUEST_TIMEOUT", () => {
    const error = new OpenClawClientError("Timeout", { code: "REQUEST_TIMEOUT" });
    expect(toConnectionErrorMessage(error)).toBe(
      "The gateway did not respond in time. Verify the URL and network access."
    );
  });

  test("returns specific message for WS_UNAVAILABLE", () => {
    const error = new OpenClawClientError("WS Unavailable", { code: "WS_UNAVAILABLE" });
    expect(toConnectionErrorMessage(error)).toBe(
      "WebSocket is unavailable in this runtime."
    );
  });

  test("returns specific message for WS errors", () => {
    const codes = ["WS_ERROR", "WS_ABNORMAL_CLOSE", "WS_CLOSED"];
    for (const code of codes) {
      const error = new OpenClawClientError("WS Error", { code });
      expect(toConnectionErrorMessage(error)).toBe(
        "Unable to keep a live WebSocket connection to the gateway."
      );
    }
  });

  test("returns specific message for server errors (>= 500)", () => {
    const error = new OpenClawClientError("Server Error", { status: 500 });
    expect(toConnectionErrorMessage(error)).toBe(
      "The gateway responded with an internal error. Try again in a moment."
    );
  });

  test("returns specific message when unable to reach the gateway (no status)", () => {
    const error = new OpenClawClientError("Network Error", { code: "NETWORK_ERROR" });
    expect(toConnectionErrorMessage(error)).toBe(
      "Unable to reach the gateway. Verify the URL and network access."
    );
  });

  test("returns error message for other OpenClawClientError", () => {
    const error = new OpenClawClientError("Custom Error", { status: 400, code: "BAD_REQUEST" });
    expect(toConnectionErrorMessage(error)).toBe("Custom Error");
  });

  test("returns error message for generic Error objects", () => {
    const error = new Error("Generic Error");
    expect(toConnectionErrorMessage(error)).toBe("Generic Error");
  });

  test("returns default message for unknown error types", () => {
    expect(toConnectionErrorMessage("Something went wrong")).toBe("Connection failed. Try again.");
  });
});

describe("isUnauthorizedConnectionError", () => {
  test("identifies unauthorized status codes", () => {
    expect(isUnauthorizedConnectionError(new OpenClawClientError("401", { status: 401 }))).toBe(true);
    expect(isUnauthorizedConnectionError(new OpenClawClientError("403", { status: 403 }))).toBe(true);
  });

  test("identifies unauthorized error codes", () => {
    const codes = ['AUTH_TOKEN_MISMATCH', 'AUTH_RATE_LIMITED', 'AUTH_UNAUTHORIZED', 'AUTH_TOKEN_MISSING'];
    for (const code of codes) {
      expect(isUnauthorizedConnectionError(new OpenClawClientError("Auth error", { code }))).toBe(true);
    }
  });

  test("returns false for non-OpenClawClientError", () => {
    expect(isUnauthorizedConnectionError(new Error("Unauthorized"))).toBe(false);
  });

  test("returns false for other status/error codes", () => {
    expect(isUnauthorizedConnectionError(new OpenClawClientError("404", { status: 404 }))).toBe(false);
    expect(isUnauthorizedConnectionError(new OpenClawClientError("Timeout", { code: 'REQUEST_TIMEOUT' }))).toBe(false);
  });
});

describe("normalizeGatewayUrl", () => {
  test("adds https to remote hostnames", () => {
    expect(normalizeGatewayUrl("example.com")).toBe("https://example.com");
    expect(normalizeGatewayUrl("  example.com  ")).toBe("https://example.com");
  });

  test("adds http to local hostnames", () => {
    expect(normalizeGatewayUrl("localhost")).toBe("http://localhost");
    expect(normalizeGatewayUrl("127.0.0.1")).toBe("http://127.0.0.1");
    expect(normalizeGatewayUrl("192.168.1.1")).toBe("http://192.168.1.1");
  });

  test("preserves existing protocol", () => {
    expect(normalizeGatewayUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeGatewayUrl("https://localhost")).toBe("https://localhost");
  });

  test("removes trailing slashes", () => {
    expect(normalizeGatewayUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeGatewayUrl("https://example.com///")).toBe("https://example.com");
  });

  test("throws error for empty input", () => {
    expect(() => normalizeGatewayUrl("")).toThrow("Enter your gateway URL.");
    expect(() => normalizeGatewayUrl("   ")).toThrow("Enter your gateway URL.");
  });

  test("throws error for invalid URL strings", () => {
    expect(() => normalizeGatewayUrl("not a url")).toThrow("Enter a valid gateway URL.");
  });

  test("throws error for non-http/https protocols", () => {
    expect(() => normalizeGatewayUrl("ftp://example.com")).toThrow("Gateway URL must start with http:// or https://.");
  });

  test("throws error for embedded credentials", () => {
    expect(() => normalizeGatewayUrl("https://user:pass@example.com")).toThrow("Gateway URL cannot include embedded credentials.");
  });

  test("throws error for query parameters or fragments", () => {
    expect(() => normalizeGatewayUrl("https://example.com?query=1")).toThrow("Gateway URL cannot include query parameters or fragments.");
    expect(() => normalizeGatewayUrl("https://example.com#fragment")).toThrow("Gateway URL cannot include query parameters or fragments.");
  });

  test("throws error for extra paths", () => {
    expect(() => normalizeGatewayUrl("https://example.com/api")).toThrow("Enter the gateway origin only, without extra paths.");
  });
});

describe("getGatewayUrlWarning", () => {
  test("returns null for valid HTTPS URLs", () => {
    expect(getGatewayUrlWarning("https://example.com")).toBeNull();
  });

  test("returns null for invalid inputs (handled internally)", () => {
    expect(getGatewayUrlWarning("")).toBeNull();
    expect(getGatewayUrlWarning("ftp://example.com")).toBeNull();
  });

  test("returns local network warning for local HTTP", () => {
    expect(getGatewayUrlWarning("http://localhost")).toBe("Non-HTTPS is only safe on a trusted local network.");
    expect(getGatewayUrlWarning("http://127.0.0.1")).toBe("Non-HTTPS is only safe on a trusted local network.");
  });

  test("returns exposed token warning for remote HTTP", () => {
    expect(getGatewayUrlWarning("http://example.com")).toBe("This gateway is using HTTP. Your operator token can be exposed on untrusted networks.");
  });
});

describe("buildSessionFromOverview", () => {
  const mockOverview: GatewayOverviewResponse = {
    gateway: {
      id: "gw-1",
      name: "Test Gateway",
      version: "1.0.0",
      online: true,
      lastSyncAt: "2023-01-01T00:00:00Z",
      capabilities: { canReadOverview: true }
    },
    session: {
      id: "sess-1",
      operatorId: "op-1",
      operatorName: "Operator One",
      metadata: { custom: "data" }
    },
    agents: [],
    recentRuns: [],
    incidents: []
  };

  test("builds session from scratch", () => {
    const session = buildSessionFromOverview(mockOverview, "https://example.com");
    expect(session.id).toBe("sess-1");
    expect(session.gatewayUrl).toBe("https://example.com");
    expect(session.operatorId).toBe("op-1");
    expect(session.operatorName).toBe("Operator One");
    expect(session.connectionState).toBe("connected");
    expect(session.gatewayName).toBe("Test Gateway");
    expect(session.metadata.gatewayOnline).toBe(true);
    expect(session.metadata.custom).toBe("data");
  });

  test("falls back to gateway ID or URL for session ID", () => {
    const overviewNoSessionId = {
      ...mockOverview,
      session: { ...mockOverview.session, id: undefined }
    };
    const session = buildSessionFromOverview(overviewNoSessionId as any, "https://example.com");
    expect(session.id).toBe("gw-1");

    const overviewNoIds = {
      ...mockOverview,
      session: { ...mockOverview.session, id: undefined },
      gateway: { ...mockOverview.gateway, id: undefined }
    };
    const session2 = buildSessionFromOverview(overviewNoIds as any, "https://example.com");
    expect(session2.id).toBe("https://example.com");
  });

  test("merges with previous session", () => {
    const prevSession: Session = {
      id: "old-id",
      gatewayUrl: "https://example.com",
      operatorId: "op-old",
      operatorName: "Old Op",
      connectionState: "disconnected",
      connectedAt: "2022-01-01T00:00:00Z",
      capabilities: { canReadOverview: false, canReadAgents: true },
      lastValidatedAt: "2022-01-01T00:00:00Z",
      metadata: { persistent: "value" }
    };

    const session = buildSessionFromOverview(mockOverview, "https://example.com", prevSession);
    expect(session.connectedAt).toBe("2022-01-01T00:00:00Z");
    expect(session.capabilities.canReadAgents).toBe(true);
    expect(session.capabilities.canReadOverview).toBe(true);
    expect(session.metadata.persistent).toBe("value");
    expect(session.metadata.gatewayOnline).toBe(true);
  });
});
