import { describe, it, expect, beforeEach, spyOn, mock } from 'bun:test';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Mock SecureStore
mock.module('expo-secure-store', () => ({
  setItemAsync: async () => {},
  getItemAsync: async () => null,
  deleteItemAsync: async () => {},
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after_first_unlock',
}));

// Mock AsyncStorage
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

// Mock react-native
mock.module('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

// Mock zustand store
mock.module('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({
      setUnauthorized: () => {},
    }),
  },
}));

import { openClawAuth } from './auth';

declare global {
  // eslint-disable-next-line no-var
  var isSecureContext: boolean;
}

describe('openClawAuth', () => {
  beforeEach(() => {
    // Reset global state
    globalThis.sessionStorage = undefined as unknown as Storage;
    globalThis.isSecureContext = true;
    (Platform as { OS: 'ios' | 'android' | 'web' }).OS = 'ios';
  });

  describe('SecureStore (Native)', () => {
    it('should use SecureStore on native platforms', async () => {
      (Platform as { OS: 'ios' | 'android' | 'web' }).OS = 'ios';
      const setSpy = spyOn(SecureStore, 'setItemAsync');

      await openClawAuth.saveTokens({ accessToken: 'test-token' });

      expect(setSpy).toHaveBeenCalled();
    });
  });

  describe('Web Storage (Web)', () => {
    beforeEach(() => {
      (Platform as { OS: 'ios' | 'android' | 'web' }).OS = 'web';

      // Mock sessionStorage
      const store: Record<string, string> = {};
      globalThis.sessionStorage = {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {},
        length: 0,
        key: (index: number) => null,
      } as Storage;
    });

    it('should not use sessionStorage on web platform (persistence disabled)', async () => {
      const setSpy = spyOn(globalThis.sessionStorage, 'setItem');

      await openClawAuth.saveTokens({ accessToken: 'web-token' });

      expect(setSpy).not.toHaveBeenCalled();
    });

    it('should handle missing storage gracefully', async () => {
      globalThis.sessionStorage = undefined as unknown as Storage;

      // Should not throw
      await openClawAuth.saveTokens({ accessToken: 'no-storage-token' });
    });
  });
});
