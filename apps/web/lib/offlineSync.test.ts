import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { withQueuedOccurredAt } from "./offlineQueue";
import { isOfflineNow, isPermanentApiRejection, shouldQueueOnSubmit } from "./offlineSync";

describe("offlineSync helpers", () => {
  it("treats validation 4xx as permanent rejection", () => {
    expect(isPermanentApiRejection(new ApiError("bad", 400))).toBe(true);
    expect(isPermanentApiRejection(new ApiError("bad", 404))).toBe(true);
    expect(isPermanentApiRejection(new ApiError("bad", 422))).toBe(true);
    expect(isPermanentApiRejection(new ApiError("bad", 401))).toBe(false);
    expect(isPermanentApiRejection(new ApiError("bad", 403))).toBe(false);
    expect(isPermanentApiRejection(new ApiError("bad", 429))).toBe(false);
    expect(isPermanentApiRejection(new ApiError("bad", 500))).toBe(false);
    expect(isPermanentApiRejection(new Error("network"))).toBe(false);
  });

  it("queues on network errors and 5xx only", () => {
    expect(shouldQueueOnSubmit(new Error("fetch failed"))).toBe(true);
    expect(shouldQueueOnSubmit(new ApiError("oops", 503))).toBe(true);
    expect(shouldQueueOnSubmit(new ApiError("bad", 400))).toBe(false);
    expect(shouldQueueOnSubmit(new ApiError("unauthorized", 401))).toBe(false);
  });
});

describe("withQueuedOccurredAt", () => {
  it("adds occurredAt when missing", () => {
    const fixed = new Date("2026-09-01T08:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixed);
    const body = withQueuedOccurredAt({ petId: "p1", presetId: "pr1" });
    expect(body.occurredAt).toBe(fixed.toISOString());
    vi.useRealTimers();
  });

  it("preserves existing occurredAt", () => {
    const iso = "2026-09-01T08:00:00.000Z";
    const body = withQueuedOccurredAt({ petId: "p1", occurredAt: iso });
    expect(body.occurredAt).toBe(iso);
  });
});

describe("isOfflineNow", () => {
  it("returns false in test environment without navigator override", () => {
    expect(isOfflineNow()).toBe(false);
  });
});
