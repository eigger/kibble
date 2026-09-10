import { describe, expect, it } from "vitest";
import { groupCourseHistory } from "./medicationCourseHistory";
import type { MedicationCourseHistoryRow, MedicationCourseProgress } from "./types";

function past(
  overrides: Partial<MedicationCourseHistoryRow> & { id: string; name: string; startDate: string },
): MedicationCourseHistoryRow {
  return {
    petId: "pet1",
    ingredients: null,
    dosage: null,
    dosesPerDay: 1,
    doseTimes: ["08:00"],
    totalDoses: null,
    endDate: null,
    note: null,
    archivedAt: "2026-09-10T00:00:00.000Z",
    dosesGivenTotal: 0,
    lastDoseAt: null,
    endedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function active(
  overrides: Partial<MedicationCourseProgress> & { id: string; name: string; startDate: string },
): MedicationCourseProgress {
  return {
    ingredients: null,
    dosage: null,
    dosesPerDay: 1,
    doseTimes: ["08:00"],
    totalDoses: null,
    endDate: null,
    note: null,
    dosesGivenTotal: 0,
    dosesGivenToday: 0,
    dosesRemaining: null,
    todayComplete: false,
    daysOnCourse: 1,
    canUndoToday: false,
    dosesToday: [],
    doseSlotsToday: [],
    ...overrides,
  };
}

describe("groupCourseHistory", () => {
  it("groups by name and puts the ongoing course on top of its lineage", () => {
    const groups = groupCourseHistory(
      [active({ id: "m3", name: "아침약", startDate: "2026-09-11T03:00:00.000Z" })],
      [
        past({ id: "m1", name: "아침약", startDate: "2026-08-15T03:00:00.000Z" }),
        past({ id: "e1", name: "저녁약", startDate: "2026-08-15T03:00:00.000Z" }),
        past({ id: "m2", name: "아침약 ", startDate: "2026-09-01T03:00:00.000Z" }),
      ],
    );
    expect(groups.map((g) => g.name)).toEqual(["아침약", "저녁약"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["m3", "m2", "m1"]);
    expect(groups[0].entries[0].ongoing).toBe(true);
  });

  it("orders groups by their most recent start", () => {
    const groups = groupCourseHistory(
      [],
      [
        past({ id: "a", name: "A", startDate: "2026-01-01T00:00:00.000Z" }),
        past({ id: "b", name: "B", startDate: "2026-03-01T00:00:00.000Z" }),
        past({ id: "a2", name: "A", startDate: "2026-05-01T00:00:00.000Z" }),
      ],
    );
    expect(groups.map((g) => g.name)).toEqual(["A", "B"]);
  });

  it("marks an ingredient change against the previous course in the same group only", () => {
    const groups = groupCourseHistory(
      [],
      [
        past({ id: "m1", name: "아침약", startDate: "2026-08-01T00:00:00.000Z", ingredients: "프레드니솔론 5mg" }),
        past({ id: "e1", name: "저녁약", startDate: "2026-08-10T00:00:00.000Z", ingredients: "우르소 100mg" }),
        past({ id: "m2", name: "아침약", startDate: "2026-08-20T00:00:00.000Z", ingredients: "프레드니솔론 5mg" }),
        past({ id: "m3", name: "아침약", startDate: "2026-09-01T00:00:00.000Z", ingredients: "프레드니솔론 2.5mg" }),
      ],
    );
    const morning = groups.find((g) => g.name === "아침약")!;
    const byId = Object.fromEntries(morning.entries.map((e) => [e.id, e.ingredientsChanged]));
    // m2는 저녁약(우르소)이 아니라 직전 아침약(m1)과 비교하므로 변경 아님
    expect(byId).toEqual({ m1: false, m2: false, m3: true });
  });

  it("ignores whitespace, line order-preserving formatting and case when comparing ingredients", () => {
    const groups = groupCourseHistory(
      [],
      [
        past({ id: "m1", name: "약", startDate: "2026-08-01T00:00:00.000Z", ingredients: "Prednisolone 5mg\n우르소  100mg" }),
        past({ id: "m2", name: "약", startDate: "2026-09-01T00:00:00.000Z", ingredients: " prednisolone 5mg \r\n\n우르소 100mg\n" }),
      ],
    );
    expect(groups[0].entries[0].ingredientsChanged).toBe(false);
  });

  it("treats a first-time ingredient entry as a change from nothing", () => {
    const groups = groupCourseHistory(
      [],
      [
        past({ id: "m1", name: "약", startDate: "2026-08-01T00:00:00.000Z", ingredients: null }),
        past({ id: "m2", name: "약", startDate: "2026-09-01T00:00:00.000Z", ingredients: "A" }),
      ],
    );
    expect(groups[0].entries.map((e) => e.ingredientsChanged)).toEqual([true, false]);
  });
});
