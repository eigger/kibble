import { describe, expect, it } from "vitest";
import { isCourseDueOn } from "./kstClock.js";

// 처방 시작일은 그날 KST 정오로 저장된다
const start = new Date("2026-11-10T12:00:00+09:00");

describe("isCourseDueOn", () => {
  it("매일(1)은 시작일 이후 항상 복용일", () => {
    expect(isCourseDueOn(start, 1, new Date("2026-11-11T01:00:00+09:00"))).toBe(true);
    expect(isCourseDueOn(start, undefined, new Date("2026-11-12T23:00:00+09:00"))).toBe(true);
  });
  it("격일(2)은 시작일, +2, +4일만 복용일", () => {
    expect(isCourseDueOn(start, 2, new Date("2026-11-10T08:00:00+09:00"))).toBe(true);
    expect(isCourseDueOn(start, 2, new Date("2026-11-11T08:00:00+09:00"))).toBe(false);
    expect(isCourseDueOn(start, 2, new Date("2026-11-12T00:00:00+09:00"))).toBe(true);
    expect(isCourseDueOn(start, 2, new Date("2026-11-13T23:59:00+09:00"))).toBe(false);
    expect(isCourseDueOn(start, 2, new Date("2026-11-14T08:00:00+09:00"))).toBe(true);
  });
  it("KST 자정 경계 — UTC가 아니라 KST 날짜로 센다", () => {
    // 2026-11-11 23:30 UTC = 11-12 08:30 KST → 복용일
    expect(isCourseDueOn(start, 2, new Date("2026-11-11T23:30:00Z"))).toBe(true);
  });
  it("시작 전이면 아니다", () => {
    expect(isCourseDueOn(start, 2, new Date("2026-11-09T12:00:00+09:00"))).toBe(false);
  });
  it("문자열 시작일·잘못된 주기는 매일로", () => {
    expect(isCourseDueOn(start.toISOString(), 0, new Date("2026-11-11T08:00:00+09:00"))).toBe(true);
  });
});
