import { describe, expect, it } from "vitest";
import { dueMedicationPushKinds } from "./medicationReminder.js";

describe("dueMedicationPushKinds", () => {
  const doseAt = new Date("2026-09-01T08:00:00+09:00");
  const prefs = { enabled: true, leadMinutes: 5, overdueMinutes: 10 };

  it("sends lead before dose time", () => {
    const now = new Date("2026-09-01T07:56:00+09:00");
    expect(
      dueMedicationPushKinds({
        now,
        doseAt,
        logged: false,
        prefs,
        sentKinds: new Set(),
      }),
    ).toEqual(["lead"]);
  });

  it("sends overdue after grace period", () => {
    const now = new Date("2026-09-01T08:11:00+09:00");
    expect(
      dueMedicationPushKinds({
        now,
        doseAt,
        logged: false,
        prefs,
        sentKinds: new Set(["lead"]),
      }),
    ).toEqual(["overdue"]);
  });

  it("skips when already logged", () => {
    const now = new Date("2026-09-01T08:11:00+09:00");
    expect(
      dueMedicationPushKinds({
        now,
        doseAt,
        logged: true,
        prefs,
        sentKinds: new Set(),
      }),
    ).toEqual([]);
  });
});
