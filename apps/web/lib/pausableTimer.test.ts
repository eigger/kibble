import { describe, expect, it, vi } from "vitest";
import { createPausableTimer } from "./pausableTimer";

describe("createPausableTimer", () => {
  it("expires exactly once", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const timer = createPausableTimer(3000, onExpire);
    vi.advanceTimersByTime(3000);
    timer.resume();
    timer.pause();
    vi.advanceTimersByTime(10_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("keeps the remaining time across pause and resume", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const timer = createPausableTimer(3000, onExpire);
    vi.advanceTimersByTime(2000);
    timer.pause();
    vi.advanceTimersByTime(60_000);
    expect(onExpire).not.toHaveBeenCalled();
    timer.resume();
    vi.advanceTimersByTime(999);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("ignores repeated pause/resume and never fires after cancel", () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const timer = createPausableTimer(1000, onExpire);
    timer.pause();
    timer.pause();
    timer.resume();
    timer.resume();
    timer.cancel();
    vi.advanceTimersByTime(5000);
    expect(onExpire).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
