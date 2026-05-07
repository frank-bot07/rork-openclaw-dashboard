import { describe, expect, it, afterEach } from "bun:test";
import { createId } from "./client-utils";

describe("createId", () => {
  const originalCrypto = globalThis.crypto;

  afterEach(() => {
    // @ts-ignore
    globalThis.crypto = originalCrypto;
  });

  it("uses randomUUID when available", () => {
    const mockUuid = "12345678-1234-1234-1234-123456781234";
    // @ts-ignore
    globalThis.crypto = {
      randomUUID: () => mockUuid,
    };

    expect(createId()).toBe(mockUuid);
  });

  it("uses getRandomValues when randomUUID is not available", () => {
    // @ts-ignore
    globalThis.crypto = {
      randomUUID: undefined,
      getRandomValues: (buffer: Uint32Array) => {
        buffer[0] = 0x12345678;
        buffer[1] = 0x9abcdef0;
        return buffer;
      },
    };

    const id = createId();
    expect(id).toMatch(/^\d+-12345678-9abcdef0$/);
  });

  it("throws an error when no secure entropy source is available", () => {
    // @ts-ignore
    globalThis.crypto = {
      randomUUID: undefined,
      getRandomValues: undefined,
    };

    expect(() => createId()).toThrow("No secure entropy source available for ID generation.");
  });

  it("throws an error when crypto is undefined", () => {
    // @ts-ignore
    globalThis.crypto = undefined;

    expect(() => createId()).toThrow("No secure entropy source available for ID generation.");
  });
});
