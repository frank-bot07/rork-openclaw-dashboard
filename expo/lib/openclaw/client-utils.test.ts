import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test';
import { createId } from './client-utils';

describe('createId', () => {
  const originalCrypto = globalThis.crypto;

  beforeEach(() => {
    // Reset crypto before each test if needed
  });

  afterEach(() => {
    // @ts-ignore
    globalThis.crypto = originalCrypto;
  });

  it('generates a string ID', () => {
    const id = createId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(createId());
    }
    expect(ids.size).toBe(100);
  });

  it('uses crypto.randomUUID if available', () => {
    const mockUUID = '00000000-0000-4000-8000-000000000000';
    // @ts-ignore
    globalThis.crypto = {
      randomUUID: () => mockUUID,
    };

    expect(createId()).toBe(mockUUID);
  });

  it('uses crypto.getRandomValues if randomUUID is unavailable', () => {
    // @ts-ignore
    globalThis.crypto = {
      getRandomValues: (array: Uint32Array) => {
        array[0] = 0xabcdef12;
        return array;
      },
    };

    const id = createId();
    expect(id).toMatch(/^\d+-abcdef12$/);
  });

  it('throws an error if crypto is unavailable', () => {
    // @ts-ignore
    globalThis.crypto = undefined;

    expect(() => createId()).toThrow('Secure random source not available');
  });
});
