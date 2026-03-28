import { mock } from "bun:test";

mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    setItem: () => Promise.resolve(),
    getItem: () => Promise.resolve(null),
    removeItem: () => Promise.resolve(),
    clear: () => Promise.resolve(),
  },
}));

mock.module("expo-secure-store", () => ({
  setItemAsync: () => Promise.resolve(),
  getItemAsync: () => Promise.resolve(null),
  deleteItemAsync: () => Promise.resolve(),
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
}));

mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (obj: any) => obj.ios || obj.default,
  },
}));

mock.module("@/stores/sessionStore", () => ({
  useSessionStore: {
    getState: () => ({
      setUnauthorized: () => {},
    }),
  },
}));
