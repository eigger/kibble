import { describe, expect, it } from "vitest";
import { planContinuation } from "./courseContinuation.js";

const now = new Date("2026-09-02T14:00:00+09:00");

describe("planContinuation", () => {
  it("archives the previous course right away when the new one starts today", () => {
    expect(planContinuation({ endDate: null }, new Date("2026-09-02T12:00:00+09:00"), now)).toEqual({
      kind: "archiveNow",
    });
    // 과거 시작일도 기존 동작
    expect(planContinuation({ endDate: null }, new Date("2026-09-01T12:00:00+09:00"), now)).toEqual({
      kind: "archiveNow",
    });
  });

  it("ends the previous course the day before an upcoming start instead of archiving", () => {
    const plan = planContinuation({ endDate: null }, new Date("2026-09-05T12:00:00+09:00"), now);
    expect(plan).toEqual({ kind: "endBeforeStart", endDate: new Date("2026-09-04T12:00:00+09:00") });
  });

  it("shortens a later end date to the day before the new start", () => {
    const plan = planContinuation(
      { endDate: new Date("2026-09-20T12:00:00+09:00") },
      new Date("2026-09-05T12:00:00+09:00"),
      now,
    );
    expect(plan).toMatchObject({ kind: "endBeforeStart", endDate: new Date("2026-09-04T12:00:00+09:00") });
  });

  it("keeps an earlier existing end date", () => {
    const plan = planContinuation(
      { endDate: new Date("2026-09-03T12:00:00+09:00") },
      new Date("2026-09-05T12:00:00+09:00"),
      now,
    );
    expect(plan).toEqual({ kind: "keep" });
  });
});
