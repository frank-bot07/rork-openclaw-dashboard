import { mock } from "bun:test";

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
  create: (fn: any) => {
    const state = fn(() => {}, () => ({}));
    return () => state;
  },
}));
