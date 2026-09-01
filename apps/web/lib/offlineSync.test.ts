import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { attachmentsToFiles } from "./offlineQueue";
import { isOfflineNow, isPermanentApiRejection, shouldQueueOnSubmit } from "./offlineSync";

describe("offlineSync helpers", () => {
  it("treats 4xx as permanent rejection", () => {
    expect(isPermanentApiRejection(new ApiError("bad", 400))).toBe(true);
    expect(isPermanentApiRejection(new ApiError("bad", 404))).toBe(true);
    expect(isPermanentApiRejection(new ApiError("bad", 500))).toBe(false);
    expect(isPermanentApiRejection(new Error("network"))).toBe(false);
  });

  it("queues on network errors and 5xx only", () => {
    expect(shouldQueueOnSubmit(new Error("fetch failed"))).toBe(true);
    expect(shouldQueueOnSubmit(new ApiError("oops", 503))).toBe(true);
    expect(shouldQueueOnSubmit(new ApiError("bad", 400))).toBe(false);
  });
});

describe("attachmentsToFiles", () => {
  it("rebuilds File objects from queued blobs", () => {
    const blob = new Blob(["x"], { type: "image/jpeg" });
    const files = attachmentsToFiles([
      { id: "1", name: "a.jpg", type: "image/jpeg", blob },
    ]);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("a.jpg");
    expect(files[0].type).toBe("image/jpeg");
  });
});

describe("isOfflineNow", () => {
  it("returns false in test environment without navigator override", () => {
    expect(isOfflineNow()).toBe(false);
  });
});
