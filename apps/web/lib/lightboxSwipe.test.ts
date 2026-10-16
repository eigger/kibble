import { describe, expect, it } from "vitest";
import { stepIndex, swipeDirection } from "./lightboxSwipe";

describe("swipeDirection", () => {
  it("왼쪽으로 끌면 다음(+1), 오른쪽이면 이전(-1)", () => {
    expect(swipeDirection(-80, 5)).toBe(1);
    expect(swipeDirection(80, -5)).toBe(-1);
  });
  it("짧거나 세로 위주의 움직임은 무시", () => {
    expect(swipeDirection(30, 0)).toBe(0);
    expect(swipeDirection(60, 60)).toBe(0);
  });
});

describe("stepIndex", () => {
  it("끝에서는 멈춘다", () => {
    expect(stepIndex(0, -1, 3)).toBeNull();
    expect(stepIndex(2, 1, 3)).toBeNull();
    expect(stepIndex(1, 1, 3)).toBe(2);
  });
});
