import { mock } from "bun:test";
import type { StateCreator } from "zustand";

mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

mock("expo-secure-store", () => ({
  setItemAsync: async () => {},
  getItemAsync: async () => null,
  deleteItemAsync: async () => {},
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
}));

mock("react-native", () => ({
  Platform: { OS: "web" },
}));

mock("zustand", () => ({
  create: <T>(fn: StateCreator<T>) => {
    const state = fn(
      (() => {}) as unknown as any,
      (() => ({})) as unknown as any,
      {} as any
    );
    return () => state;
  },
}));
