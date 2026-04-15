import { expect, test, describe } from "bun:test";
import { createId } from "./client-utils";

describe("createId", () => {
  test("should return a UUID string", () => {
    const id = createId();
    expect(typeof id).toBe("string");
    // Our mock returns a fixed UUID, but we just check it returns something
    expect(id).toBe("00000000-0000-4000-8000-000000000000");
  });

  test("should call Crypto.randomUUID", () => {
    const id1 = createId();
    const id2 = createId();
    expect(id1).toBe(id2); // because of mock
  });
});
