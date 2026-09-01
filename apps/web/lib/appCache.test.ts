import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAppCaches } from "./appCache";

const original = Reflect.get(globalThis, "caches");

function stubCaches(value: unknown): void {
  Reflect.set(globalThis, "caches", value);
}

afterEach(() => {
  if (original === undefined) Reflect.deleteProperty(globalThis, "caches");
  else stubCaches(original);
});

describe("clearAppCaches", () => {
  it("deletes every cache the service worker opened", async () => {
    const del = vi.fn().mockResolvedValue(true);
    stubCaches({ keys: vi.fn().mockResolvedValue(["kibble-shell-v3", "kibble-shell-v2"]), delete: del });

    await clearAppCaches();

    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith("kibble-shell-v3");
    expect(del).toHaveBeenCalledWith("kibble-shell-v2");
  });

  it("is a no-op where CacheStorage does not exist", async () => {
    Reflect.deleteProperty(globalThis, "caches");
    await expect(clearAppCaches()).resolves.toBeUndefined();
  });

  it("swallows a blocked CacheStorage so logout still completes", async () => {
    stubCaches({
      keys: vi.fn().mockRejectedValue(new Error("SecurityError")),
      delete: vi.fn(),
    });
    await expect(clearAppCaches()).resolves.toBeUndefined();
  });
});
