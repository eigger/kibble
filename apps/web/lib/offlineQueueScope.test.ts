import { beforeEach, describe, expect, it, vi } from "vitest";
import { isOwnedBy, listOfflineEvents, removeOfflineEvent, type QueuedEvent } from "./offlineQueue";
import { flushOfflineQueue } from "./offlineSync";
import { apiJson } from "./api";

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  apiJson: vi.fn(),
}));

vi.mock("./offlineQueue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./offlineQueue")>()),
  listOfflineEvents: vi.fn(),
  removeOfflineEvent: vi.fn(),
  updateOfflineEvent: vi.fn(),
}));

function queued(id: string, userId: string): QueuedEvent {
  return {
    id,
    queuedAt: 1,
    userId,
    labelKey: "preset.meal",
    body: { petId: "pet_1", presetId: "preset_1" },
    attachments: [],
  };
}

describe("isOwnedBy", () => {
  it("matches only the owner", () => {
    expect(isOwnedBy(queued("q1", "user_a"), "user_a")).toBe(true);
    expect(isOwnedBy(queued("q1", "user_a"), "user_b")).toBe(false);
  });

  it("rejects an entry with no owner — v2 스토어에는 존재할 수 없는 형태다", () => {
    const ownerless = { ...queued("q1", "user_a"), userId: undefined } as unknown as QueuedEvent;
    expect(isOwnedBy(ownerless, "user_b")).toBe(false);
  });
});

describe("flushOfflineQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks only for the current user's entries", async () => {
    vi.mocked(listOfflineEvents).mockResolvedValue([]);

    await flushOfflineQueue("user_a");

    expect(listOfflineEvents).toHaveBeenCalledWith("user_a");
    expect(vi.mocked(listOfflineEvents).mock.calls.every(([id]) => id === "user_a")).toBe(true);
  });

  it("sends the entries it was handed and clears them", async () => {
    vi.mocked(listOfflineEvents).mockResolvedValueOnce([queued("q1", "user_a")]);
    vi.mocked(listOfflineEvents).mockResolvedValue([]);
    vi.mocked(apiJson).mockResolvedValue({ id: "event_1" });

    const result = await flushOfflineQueue("user_a");

    expect(apiJson).toHaveBeenCalledTimes(1);
    expect(removeOfflineEvent).toHaveBeenCalledWith("q1");
    expect(result).toEqual({ synced: 1, rejected: 0, remaining: 0 });
  });

  it("posts nothing when the current user has no entries — 다른 사용자 큐는 건드리지 않는다", async () => {
    vi.mocked(listOfflineEvents).mockResolvedValue([]);

    const result = await flushOfflineQueue("user_b");

    expect(apiJson).not.toHaveBeenCalled();
    expect(removeOfflineEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ synced: 0, rejected: 0, remaining: 0 });
  });
});
