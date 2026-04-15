import { expect, test, describe, spyOn, beforeEach, afterEach } from "bun:test";
import {
  parseSocketMessage,
  normalizeBaseUrl,
  toWebSocketUrl,
  isAuthError,
  dedupeStrings,
  asRecord
} from "./client-utils";

describe("parseSocketMessage", () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test("returns null for non-string input", () => {
    expect(parseSocketMessage(null)).toBeNull();
    expect(parseSocketMessage(123)).toBeNull();
    expect(parseSocketMessage({})).toBeNull();
  });

  test("returns null and logs error for invalid JSON string", () => {
    const result = parseSocketMessage("{ invalid json }");
    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
  });

  test("returns null for JSON that is not a record", () => {
    expect(parseSocketMessage("123")).toBeNull();
    expect(parseSocketMessage("null")).toBeNull();
    expect(parseSocketMessage("[]")).toBeNull();
  });

  test("returns null for record without type", () => {
    expect(parseSocketMessage('{"foo":"bar"}')).toBeNull();
  });

  test("parses valid event message", () => {
    const data = JSON.stringify({
      type: 'event',
      event: 'test-event',
      payload: { foo: 'bar' },
      seq: 42
    });
    const result = parseSocketMessage(data);
    expect(result).toEqual({
      type: 'event',
      event: 'test-event',
      payload: { foo: 'bar' },
      seq: 42
    });
  });

  test("parses event message without optional seq", () => {
    const data = JSON.stringify({
      type: 'event',
      event: 'test-event',
      payload: { foo: 'bar' }
    });
    const result = parseSocketMessage(data);
    expect(result).toEqual({
      type: 'event',
      event: 'test-event',
      payload: { foo: 'bar' },
      seq: undefined
    });
  });

  test("parses valid success response message", () => {
    const data = JSON.stringify({
      type: 'res',
      id: 'req-1',
      ok: true,
      payload: { data: 'ok' }
    });
    const result = parseSocketMessage(data);
    expect(result).toEqual({
      type: 'res',
      id: 'req-1',
      ok: true,
      payload: { data: 'ok' },
      error: undefined
    });
  });

  test("parses valid error response message", () => {
    const data = JSON.stringify({
      type: 'res',
      id: 'req-2',
      ok: false,
      error: {
        code: 'ERR_CODE',
        message: 'Something went wrong',
        details: { more: 'info' }
      }
    });
    const result = parseSocketMessage(data);
    expect(result).toEqual({
      type: 'res',
      id: 'req-2',
      ok: false,
      payload: undefined,
      error: {
        code: 'ERR_CODE',
        message: 'Something went wrong',
        details: { more: 'info' }
      }
    });
  });
});

describe("normalizeBaseUrl", () => {
  test("removes trailing slashes", () => {
    expect(normalizeBaseUrl("http://api.com/")).toBe("http://api.com");
    expect(normalizeBaseUrl("https://api.com///")).toBe("https://api.com");
  });

  test("keeps URL without trailing slashes", () => {
    expect(normalizeBaseUrl("http://api.com")).toBe("http://api.com");
  });
});

describe("toWebSocketUrl", () => {
  test("converts http to ws", () => {
    expect(toWebSocketUrl("http://api.com")).toBe("ws://api.com/");
  });

  test("converts https to wss", () => {
    expect(toWebSocketUrl("https://api.com")).toBe("wss://api.com/");
  });

  test("handles trailing slashes in base URL", () => {
    expect(toWebSocketUrl("http://api.com/")).toBe("ws://api.com/");
  });
});

describe("isAuthError", () => {
  test("returns true for auth error codes", () => {
    expect(isAuthError("AUTH_TOKEN_MISMATCH")).toBe(true);
    expect(isAuthError("AUTH_RATE_LIMITED")).toBe(true);
    expect(isAuthError("AUTH_UNAUTHORIZED")).toBe(true);
    expect(isAuthError("AUTH_TOKEN_MISSING")).toBe(true);
  });

  test("returns false for other codes or undefined", () => {
    expect(isAuthError("OTHER_ERROR")).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
    expect(isAuthError("")).toBe(false);
  });
});

describe("dedupeStrings", () => {
  test("removes duplicates", () => {
    expect(dedupeStrings(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  test("removes null, undefined, and empty strings", () => {
    expect(dedupeStrings(["a", null, "b", undefined, "", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("asRecord", () => {
  test("returns record for object", () => {
    const obj = { foo: "bar" };
    expect(asRecord(obj)).toBe(obj);
  });

  test("returns null for array, null, or primitives", () => {
    expect(asRecord([])).toBeNull();
    expect(asRecord(null)).toBeNull();
    expect(asRecord("string")).toBeNull();
    expect(asRecord(123)).toBeNull();
    expect(asRecord(true)).toBeNull();
  });
});
