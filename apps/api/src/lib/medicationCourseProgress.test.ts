import { describe, expect, it } from "vitest";
import {
  nextDoseOrdinal,
  pastMedicationCourseWhere,
  resolveCourseEndedAt,
  resolveMedicationDoseLog,
} from "./medicationCourseProgress.js";

describe("nextDoseOrdinal", () => {
  it("starts at 1 on an empty course", () => {
    expect(nextDoseOrdinal(null, 0)).toBe(1);
  });

  it("continues from the highest number already stamped", () => {
    expect(nextDoseOrdinal(3, 3)).toBe(4);
  });

  it("leaves a gap instead of reusing a deleted dose's number", () => {
    // 1·2·3을 찍고 2를 지운 뒤 다시 기록: 남은 이벤트는 2건이지만 3은 이미 쓰였다
    expect(nextDoseOrdinal(3, 2)).toBe(4);
  });

  it("picks up after unnumbered doses from before the column existed", () => {
    expect(nextDoseOrdinal(null, 5)).toBe(6);
  });

  it("keeps counting past a mix of numbered and unnumbered doses", () => {
    expect(nextDoseOrdinal(6, 6)).toBe(7);
  });
});

describe("resolveMedicationDoseLog", () => {
  const now = new Date("2026-09-01T14:00:00+09:00");

  it("counts legacy courses without dose times", () => {
    const result = resolveMedicationDoseLog(
      { dosesPerDay: 2, doseTimes: [] },
      [{ doseSlotIndex: null }],
      undefined,
      now,
    );
    expect(result).toEqual({ doseSlotIndex: null, occurredAt: now });
  });

  it("rejects when daily limit reached (legacy)", () => {
    const result = resolveMedicationDoseLog(
      { dosesPerDay: 1, doseTimes: [] },
      [{ doseSlotIndex: null }],
      undefined,
      now,
    );
    expect(result).toEqual({ error: "limit" });
  });

  it("picks first empty slot by default", () => {
    const result = resolveMedicationDoseLog(
      { dosesPerDay: 2, doseTimes: ["08:00", "19:00"] },
      [],
      undefined,
      now,
    );
    expect(result).toMatchObject({ doseSlotIndex: 0 });
    if ("occurredAt" in result) {
      expect(result.occurredAt.getTime()).toBe(
        new Date("2026-09-01T08:00:00+09:00").getTime(),
      );
    }
  });

  it("rejects duplicate slot", () => {
    const result = resolveMedicationDoseLog(
      { dosesPerDay: 2, doseTimes: ["08:00", "19:00"] },
      [{ doseSlotIndex: 0 }],
      0,
      now,
    );
    expect(result).toEqual({ error: "slotTaken" });
  });
});

describe("resolveCourseEndedAt", () => {
  const now = new Date("2026-09-11T09:00:00+09:00");
  const endDate = new Date("2026-09-05T12:00:00+09:00");
  const archivedAt = new Date("2026-09-08T20:00:00+09:00");
  const lastDoseAt = new Date("2026-09-03T08:00:00+09:00");

  it("prefers the last dose — that is when the pet actually stopped taking it", () => {
    expect(resolveCourseEndedAt({ endDate, archivedAt }, lastDoseAt, now)).toBe(lastDoseAt);
  });

  it("falls back to a past endDate when nothing was logged", () => {
    expect(resolveCourseEndedAt({ endDate, archivedAt }, null, now)).toBe(endDate);
  });

  it("ignores a future endDate on a course ended early and uses archivedAt", () => {
    const future = new Date("2026-12-01T12:00:00+09:00");
    expect(resolveCourseEndedAt({ endDate: future, archivedAt }, null, now)).toBe(archivedAt);
  });

  it("is null for an open-ended course that was never ended", () => {
    expect(resolveCourseEndedAt({ endDate: null, archivedAt: null }, null, now)).toBeNull();
  });
});

describe("pastMedicationCourseWhere", () => {
  it("is the complement of the active list: archived OR endDate passed", () => {
    const now = new Date("2026-09-11T09:00:00+09:00");
    expect(pastMedicationCourseWhere(now)).toEqual({
      OR: [{ archivedAt: { not: null } }, { endDate: { lt: now } }],
    });
  });
});
