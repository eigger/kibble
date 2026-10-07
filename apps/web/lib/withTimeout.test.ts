import { describe, expect, it, vi } from "vitest";
import { bestEffort } from "./withTimeout";

describe("bestEffort", () => {
  it("resolves when the task finishes", async () => {
    const task = vi.fn(async () => "ok");
    await bestEffort(task, 50);
    expect(task).toHaveBeenCalledOnce();
  });

  it("swallows failures, sync or async", async () => {
    await expect(bestEffort(async () => Promise.reject(new Error("x")), 50)).resolves.toBeUndefined();
    await expect(
      bestEffort(() => {
        throw new Error("sync");
      }, 50),
    ).resolves.toBeUndefined();
  });

  it("does not wait for a task that never ends", async () => {
    vi.useFakeTimers();
    const done = bestEffort(() => new Promise(() => {}), 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(done).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});
