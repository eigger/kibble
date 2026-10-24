import { describe, expect, it, vi } from "vitest";
import { upgradeOfflineDb } from "./offlineQueue";

/** contains는 실제 IDB처럼 삭제·생성 상태를 따라간다 */
function fakeDb(hasStore: boolean) {
  const stores = new Set<string>(hasStore ? ["events"] : []);
  return {
    objectStoreNames: { contains: vi.fn((n: string) => stores.has(n)) },
    deleteObjectStore: vi.fn((n: string) => void stores.delete(n)),
    createObjectStore: vi.fn((n: string) => void stores.add(n)),
    stores,
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
    expect(db.createObjectStore).toHaveBeenCalledWith("events", { keyPath: "id" });
    expect(db.stores.has("events")).toBe(true);
  });

  it("keeps queued records when upgrading from v2 or later", () => {
    const db = fakeDb(true);
    upgradeOfflineDb(db as never, 2);
    expect(db.deleteObjectStore).not.toHaveBeenCalled();
    expect(db.createObjectStore).not.toHaveBeenCalled();
  });
});
