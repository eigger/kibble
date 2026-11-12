import { describe, expect, it } from "vitest";
import { isCourseDoneToday, planMedicationPick } from "./medicationPick";

const course = (id: string, perDay: number, given: number) => ({
  id,
  dosesPerDay: perDay,
  dosesGivenToday: given,
});

describe("planMedicationPick", () => {
  it("has nothing to pick without courses", () => {
    expect(planMedicationPick([])).toEqual({ kind: "none" });
  });

  it("auto-selects the only course left today", () => {
    expect(planMedicationPick([course("a", 2, 1)])).toEqual({ kind: "auto", course: course("a", 2, 1) });
  });

  it("skips courses already done today when choosing", () => {
    const plan = planMedicationPick([course("a", 1, 1), course("b", 2, 0)]);
    expect(plan).toEqual({ kind: "auto", course: course("b", 2, 0) });
  });

  it("reports allDone instead of opening a list of finished courses", () => {
    expect(planMedicationPick([course("a", 1, 1), course("b", 2, 2)])).toEqual({ kind: "allDone" });
  });

  it("asks only when two or more courses remain", () => {
    expect(planMedicationPick([course("a", 1, 0), course("b", 1, 0)])).toEqual({ kind: "pick" });
  });

  it("treats a zeroed offline snapshot as not done", () => {
    expect(isCourseDoneToday(course("a", 1, 0))).toBe(false);
  });
});

describe("쉬는 날 (격일 처방, §7.28)", () => {
  it("dueToday=false 면 기록이 없어도 오늘 몫을 마친 것으로 본다", () => {
    expect(isCourseDoneToday({ id: "a", dosesPerDay: 1, dosesGivenToday: 0, dueToday: false })).toBe(true);
  });
  it("쉬는 날 처방만 있으면 allDone, 복용일 처방이 하나면 auto", () => {
    const rest = { id: "a", dosesPerDay: 1, dosesGivenToday: 0, dueToday: false };
    const due = { id: "b", dosesPerDay: 1, dosesGivenToday: 0, dueToday: true };
    expect(planMedicationPick([rest]).kind).toBe("allDone");
    expect(planMedicationPick([rest, due])).toEqual({ kind: "auto", course: due });
  });
});
