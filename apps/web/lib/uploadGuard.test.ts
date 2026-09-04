import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginUploadGuard,
  endUploadGuard,
  isUploadInProgress,
  resetUploadGuardForTests,
  withUploadGuard,
} from "./uploadGuard";

function listenerCount(spy: { mock: { calls: unknown[][] } }): number {
  return spy.mock.calls.filter((call) => call[0] === "beforeunload").length;
}

describe("uploadGuard", () => {
  afterEach(() => {
    resetUploadGuardForTests();
    vi.restoreAllMocks();
  });

  it("attaches the listener only once for nested uploads", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");

    beginUploadGuard();
    beginUploadGuard();
    expect(listenerCount(add)).toBe(1);
    expect(isUploadInProgress()).toBe(true);

    endUploadGuard();
    // 아직 하나가 남아 있으면 떼지 않는다 — 배치 중간에 보호가 풀리면 안 된다
    expect(listenerCount(remove)).toBe(0);
    expect(isUploadInProgress()).toBe(true);

    endUploadGuard();
    expect(listenerCount(remove)).toBe(1);
    expect(isUploadInProgress()).toBe(false);
  });

  it("releases the guard when the upload throws", async () => {
    await expect(
      withUploadGuard(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(isUploadInProgress()).toBe(false);
  });

  it("returns the wrapped value and releases", async () => {
    await expect(withUploadGuard(async () => "done")).resolves.toBe("done");
    expect(isUploadInProgress()).toBe(false);
  });

  it("ignores an unbalanced end", () => {
    endUploadGuard();
    expect(isUploadInProgress()).toBe(false);
  });

  // 브라우저가 확인창을 띄우려면 이벤트가 취소돼야 한다
  it("cancels the unload event while an upload runs", () => {
    beginUploadGuard();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets the page close once uploads finish", () => {
    beginUploadGuard();
    endUploadGuard();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
