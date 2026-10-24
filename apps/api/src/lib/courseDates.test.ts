import { describe, expect, it } from "vitest";
import { clampEndDate } from "./courseDates.js";

describe("clampEndDate", () => {
  const start = new Date("2026-09-05T03:00:00.000Z");
  it("종료일이 시작일보다 앞서면 시작일로 맞춘다", () => {
    expect(clampEndDate(start, new Date("2026-09-01T03:00:00.000Z"))).toEqual(start);
  });
  it("정상 범위와 null/undefined는 그대로 둔다", () => {
    const end = new Date("2026-09-10T03:00:00.000Z");
    expect(clampEndDate(start, end)).toBe(end);
    expect(clampEndDate(start, start)).toEqual(start);
    expect(clampEndDate(start, null)).toBeNull();
    expect(clampEndDate(start, undefined)).toBeUndefined();
  });
});
