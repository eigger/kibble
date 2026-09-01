import { describe, expect, it } from "vitest";
import { resolveMedicationDoseLog } from "./medicationCourseProgress.js";

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
