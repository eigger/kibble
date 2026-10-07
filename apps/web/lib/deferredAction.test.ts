import { describe, expect, it, vi } from "vitest";
import { deferOnce } from "./deferredAction";

describe("deferOnce", () => {
  it("runs once after the delay, and flush/cancel afterwards do nothing", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const action = deferOnce(run, 3500);
    vi.advanceTimersByTime(3499);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
    action.flush();
    action.cancel();
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("never runs when cancelled (undo)", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const action = deferOnce(run, 3500);
    action.cancel();
    action.flush();
    vi.advanceTimersByTime(10_000);
    expect(run).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("flush runs immediately exactly once (page leave, failed restore)", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const action = deferOnce(run, 3500);
    action.flush();
    action.flush();
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
