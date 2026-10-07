import { describe, expect, it } from "vitest";
import { doseConflict } from "./doseCapacity.js";

const slots = (...v: (number | null)[]) => v.map((doseSlotIndex) => ({ doseSlotIndex }));

describe("doseConflict", () => {
  const base = { doseSlotCount: 2, dosesPerDay: 2 };

  it("flags a requested slot that is already filled, ignoring other slots", () => {
    expect(doseConflict({ ...base, sameDay: slots(0), requestedSlot: 0 })).toBe("DOSE_SLOT_TAKEN");
    expect(doseConflict({ ...base, sameDay: slots(0), requestedSlot: 1 })).toBeNull();
  });

  it("counts only numbered slots as filled when no slot is requested", () => {
    // 슬롯 없는 옛 기록 둘은 칸을 차지하지 않는다
    expect(doseConflict({ ...base, sameDay: slots(null, null), requestedSlot: null })).toBeNull();
    expect(doseConflict({ ...base, sameDay: slots(0, null), requestedSlot: null })).toBeNull();
    expect(doseConflict({ ...base, sameDay: slots(0, 1), requestedSlot: null })).toBe("DOSE_LIMIT_REACHED");
  });

  it("uses the daily count for courses without slots", () => {
    const noSlots = { doseSlotCount: 0, dosesPerDay: 2 };
    expect(doseConflict({ ...noSlots, sameDay: slots(null), requestedSlot: null })).toBeNull();
    expect(doseConflict({ ...noSlots, sameDay: slots(null, null), requestedSlot: null })).toBe(
      "DOSE_LIMIT_REACHED",
    );
  });
});
