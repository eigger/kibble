import { describe, expect, it, vi } from "vitest";
import { createToastLifecycle } from "./toastLifecycle";

function setup() {
  const calls: string[] = [];
  const life = createToastLifecycle((id) => calls.push(`remove:${id}`));
  return { calls, life };
}

describe("createToastLifecycle", () => {
  it("expiry closes once and calls onClose once", () => {
    vi.useFakeTimers();
    const { calls, life } = setup();
    life.open(1, 3000, () => calls.push("close"));
    vi.advanceTimersByTime(3000);
    life.close(1);
    vi.advanceTimersByTime(10_000);
    expect(calls).toEqual(["remove:1", "close"]);
    vi.useRealTimers();
  });

  it("pressing the action runs onClick before onClose, once, and cancels the timer", () => {
    vi.useFakeTimers();
    const { calls, life } = setup();
    life.open(1, 3000, () => calls.push("close"));
    life.press(1, () => calls.push("click"));
    life.press(1, () => calls.push("click-again"));
    vi.advanceTimersByTime(10_000);
    expect(calls).toEqual(["click", "remove:1", "close"]);
    vi.useRealTimers();
  });

  it("stays paused until both hover and focus are released", () => {
    vi.useFakeTimers();
    const { calls, life } = setup();
    life.open(1, 3000, () => calls.push("close"));
    life.hold(1, "focus");
    life.hold(1, "hover");
    life.release(1, "hover"); // 키보드 포커스 중 마우스가 지나갔다 — 여전히 멈춘 채
    vi.advanceTimersByTime(60_000);
    expect(calls).toEqual([]);
    life.release(1, "focus");
    vi.advanceTimersByTime(3000);
    expect(calls).toEqual(["remove:1", "close"]);
    vi.useRealTimers();
  });

  it("keeps the time left when resuming", () => {
    vi.useFakeTimers();
    const { calls, life } = setup();
    life.open(1, 3000, () => calls.push("close"));
    vi.advanceTimersByTime(2000);
    life.hold(1, "hover");
    vi.advanceTimersByTime(60_000);
    life.release(1, "hover");
    vi.advanceTimersByTime(999);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(["remove:1", "close"]);
    vi.useRealTimers();
  });

  it("ignores holds on toasts that are already gone", () => {
    const { calls, life } = setup();
    life.hold(9, "hover");
    life.release(9, "hover");
    life.press(9, () => calls.push("click"));
    expect(calls).toEqual([]);
  });
});
