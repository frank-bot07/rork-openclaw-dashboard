import { mock } from 'bun:test';

// Mock react-native
mock.module('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

// Mock @react-native-async-storage/async-storage
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: mock(() => Promise.resolve()),
    getItem: mock(() => Promise.resolve(null)),
    removeItem: mock(() => Promise.resolve()),
  },
}));

// Mock expo-secure-store
mock.module('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  setItemAsync: mock(() => Promise.resolve()),
  getItemAsync: mock(() => Promise.resolve(null)),
  deleteItemAsync: mock(() => Promise.resolve()),
}));

// Mock sessionStore
mock.module('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({
      setUnauthorized: mock(),
    }),
  },
}));
