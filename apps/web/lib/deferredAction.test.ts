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

  it("cancelling before an in-flight operation keeps the timer from firing mid-way", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const action = deferOnce(run, 3500);
    vi.advanceTimersByTime(3400);
    // 실행취소 클릭 → 복원 요청 시작 전에 거둔다. 요청이 길어져 유예가 지나도 실행되지 않는다
    action.cancel();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("without a delay it only ends on flush or cancel", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const action = deferOnce(run, null);
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
    action.flush();
    action.flush();
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
