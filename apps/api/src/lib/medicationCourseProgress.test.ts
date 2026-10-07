import { describe, expect, it, vi } from "vitest";
import {
  courseStartsByTodayBefore,
  medicationCoursesWithProgress,
  todayDoseTargets,
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
    // 기록 시각은 슬롯 시각이 아니라 누른 시각이다 (WORKPLAN §3.10)
    expect(result).toEqual({ doseSlotIndex: 0, occurredAt: now });
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

  it("does not treat today's endDate as already passed in the afternoon", () => {
    const todayNoon = new Date("2026-09-11T12:00:00+09:00");
    const afternoon = new Date("2026-09-11T15:00:00+09:00");
    expect(resolveCourseEndedAt({ endDate: todayNoon, archivedAt: afternoon }, null, afternoon)).toBe(
      afternoon,
    );
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
      OR: [{ archivedAt: { not: null } }, { endDate: { lt: new Date("2026-09-10T15:00:00.000Z") } }],
    });
  });
});

describe("courseStartsByTodayBefore (시작일은 KST 정오로 저장된다)", () => {
  const includes = (startDate: string, now: string) =>
    new Date(startDate) < courseStartsByTodayBefore(new Date(now));

  it("includes a course starting today, even in the morning before its noon timestamp", () => {
    expect(includes("2026-09-02T12:00:00+09:00", "2026-09-02T07:55:00+09:00")).toBe(true);
  });

  it("excludes a course that starts tomorrow", () => {
    expect(includes("2026-09-03T12:00:00+09:00", "2026-09-02T23:59:00+09:00")).toBe(false);
  });
});

describe("medicationCoursesWithProgress — 예정 처방", () => {
  const now = new Date("2026-09-02T07:55:00+09:00");
  const course = (id: string, startDate: string) => ({
    id,
    householdId: "h1",
    petId: "pet1",
    name: id,
    ingredients: null,
    dosage: null,
    dosesPerDay: 1,
    doseTimes: [],
    totalDoses: null,
    startDate: new Date(startDate),
    endDate: null,
    note: null,
    archivedAt: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
  });

  function fakeDb(courses: ReturnType<typeof course>[]) {
    const findMany = vi.fn(async () => courses);
    const db = {
      medicationCourse: { findMany },
      event: { groupBy: vi.fn(async () => []), findMany: vi.fn(async () => []) },
    } as never;
    return { db, findMany };
  }

  it("keeps a future course in the list (care screen) and flags it upcoming", async () => {
    const { db, findMany } = fakeDb([
      course("today", "2026-09-02T12:00:00+09:00"),
      course("tomorrow", "2026-09-03T12:00:00+09:00"),
    ]);
    const rows = await medicationCoursesWithProgress(db, "h1", "pet1", now);
    expect(rows.map((r) => [r.id, r.upcoming])).toEqual([
      ["today", false],
      ["tomorrow", true],
    ]);
    const where = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.startDate).toBeUndefined();
    expect(where.householdId).toBe("h1");
  });

  it("puts upcoming courses last and keeps the rest in query order", async () => {
    const { db } = fakeDb([
      course("up1", "2026-09-05T12:00:00+09:00"),
      course("a", "2026-09-02T12:00:00+09:00"),
      course("up2", "2026-09-03T12:00:00+09:00"),
      course("b", "2026-09-01T12:00:00+09:00"),
    ]);
    const rows = await medicationCoursesWithProgress(db, "h1", "pet1", now);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "up1", "up2"]);
  });

  it("todayDoseTargets drops upcoming courses for /q, home and states", async () => {
    const { db } = fakeDb([
      course("today", "2026-09-02T12:00:00+09:00"),
      course("tomorrow", "2026-09-03T12:00:00+09:00"),
    ]);
    const rows = await medicationCoursesWithProgress(db, "h1", "pet1", now);
    expect(todayDoseTargets(rows).map((r) => r.id)).toEqual(["today"]);
  });
});
