import { expect, test, describe } from "bun:test";
import {
  normalizeBaseUrl,
  toWebSocketUrl,
  isAuthError,
  dedupeStrings,
  firstString,
  firstNumber,
  firstBoolean,
  safeHostname,
  getArray,
  normalizeStringArray,
  asRecord
} from "./client-utils";

describe("normalizeBaseUrl", () => {
  test("removes single trailing slash", () => {
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
  });

  test("removes multiple trailing slashes", () => {
    expect(normalizeBaseUrl("https://example.com///")).toBe("https://example.com");
  });

  test("preserves URL without trailing slash", () => {
    expect(normalizeBaseUrl("https://example.com")).toBe("https://example.com");
  });

  test("handles empty string", () => {
    expect(normalizeBaseUrl("")).toBe("");
  });

  test("handles string with only slashes", () => {
    expect(normalizeBaseUrl("///")).toBe("");
  });
});

describe("toWebSocketUrl", () => {
  test("converts http to ws", () => {
    expect(toWebSocketUrl("http://example.com")).toBe("ws://example.com/");
  });

  test("converts https to wss", () => {
    expect(toWebSocketUrl("https://example.com")).toBe("wss://example.com/");
  });

  test("handles trailing slashes in base URL", () => {
    expect(toWebSocketUrl("https://example.com///")).toBe("wss://example.com/");
  });

  test("preserves existing ws/wss protocols", () => {
    expect(toWebSocketUrl("ws://example.com")).toBe("ws://example.com/");
    expect(toWebSocketUrl("wss://example.com")).toBe("wss://example.com/");
  });
});

describe("isAuthError", () => {
  test("returns true for known auth error codes", () => {
    expect(isAuthError("AUTH_TOKEN_MISMATCH")).toBe(true);
    expect(isAuthError("AUTH_RATE_LIMITED")).toBe(true);
    expect(isAuthError("AUTH_UNAUTHORIZED")).toBe(true);
    expect(isAuthError("AUTH_TOKEN_MISSING")).toBe(true);
  });

  test("returns false for other codes", () => {
    expect(isAuthError("NOT_FOUND")).toBe(false);
    expect(isAuthError("SERVER_ERROR")).toBe(false);
    expect(isAuthError("")).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
});

describe("dedupeStrings", () => {
  test("removes duplicates and empty/null/undefined values", () => {
    const input = ["a", "b", "a", "", null, undefined, "c", "b"];
    expect(dedupeStrings(input)).toEqual(["a", "b", "c"]);
  });

  test("returns empty array for empty input", () => {
    expect(dedupeStrings([])).toEqual([]);
  });
});

describe("firstString", () => {
  test("returns the first non-empty string", () => {
    expect(firstString(null, undefined, "", "  ", "hello", "world")).toBe("hello");
  });

  test("returns undefined if no non-empty string is found", () => {
    expect(firstString(null, 123, "", "  ")).toBeUndefined();
  });
});

describe("firstNumber", () => {
  test("returns the first finite number", () => {
    expect(firstNumber(null, undefined, NaN, Infinity, 42, 100)).toBe(42);
  });

  test("returns undefined if no finite number is found", () => {
    expect(firstNumber("42", NaN, null)).toBeUndefined();
  });
});

describe("firstBoolean", () => {
  test("returns the first boolean", () => {
    expect(firstBoolean(null, undefined, false, true)).toBe(false);
    expect(firstBoolean(1, "true", true, false)).toBe(true);
  });

  test("returns undefined if no boolean is found", () => {
    expect(firstBoolean(0, 1, "false")).toBeUndefined();
  });
});

describe("safeHostname", () => {
  test("extracts hostname from valid URL", () => {
    expect(safeHostname("https://example.com/path?query")).toBe("example.com");
  });

  test("returns input as fallback for invalid URL", () => {
    expect(safeHostname("not-a-url")).toBe("not-a-url");
  });
});

describe("getArray", () => {
  test("returns array if input is an array", () => {
    expect(getArray([1, 2])).toEqual([1, 2]);
  });

  test("returns null if input is not an array", () => {
    expect(getArray({})).toBeNull();
    expect(getArray("not-array")).toBeNull();
    expect(getArray(null)).toBeNull();
  });
});

describe("normalizeStringArray", () => {
  test("returns only strings from an array", () => {
    expect(normalizeStringArray(["a", 1, "b", null, {}])).toEqual(["a", "b"]);
  });

  test("returns null if input is not an array", () => {
    expect(normalizeStringArray("not-array")).toBeNull();
  });
});

describe("asRecord", () => {
  test("returns object if input is a record", () => {
    const obj = { key: "value" };
    expect(asRecord(obj)).toBe(obj);
  });

  test("returns null for non-objects or arrays", () => {
    expect(asRecord([])).toBeNull();
    expect(asRecord(null)).toBeNull();
    expect(asRecord("string")).toBeNull();
    expect(asRecord(123)).toBeNull();
  });
});
