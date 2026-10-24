import { describe, expect, it, vi } from "vitest";
import { upgradeOfflineDb } from "./offlineQueue";

function fakeDb(hasStore: boolean) {
  return {
    objectStoreNames: { contains: vi.fn(() => hasStore) },
    deleteObjectStore: vi.fn(),
    createObjectStore: vi.fn(),
  };
}

describe("upgradeOfflineDb", () => {
  it("creates the store on a fresh database", () => {
    const db = fakeDb(false);
    upgradeOfflineDb(db as never, 0);
    expect(db.deleteObjectStore).not.toHaveBeenCalled();
    expect(db.createObjectStore).toHaveBeenCalledWith("events", { keyPath: "id" });
  });

  it("drops the ownerless v1 store", () => {
    const db = fakeDb(true);
    upgradeOfflineDb(db as never, 1);
    expect(db.deleteObjectStore).toHaveBeenCalledWith("events");
  });

  it("keeps queued records when upgrading from v2 or later", () => {
    const db = fakeDb(true);
    upgradeOfflineDb(db as never, 2);
    expect(db.deleteObjectStore).not.toHaveBeenCalled();
    expect(db.createObjectStore).not.toHaveBeenCalled();
  });
});
