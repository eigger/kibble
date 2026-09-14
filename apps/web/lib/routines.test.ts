import { describe, expect, it } from "vitest";
import { buildRoutineEventBodies, routineItemSummary, routineSummary } from "./routines";
import type { Routine, RoutineItem } from "./types";

const tLabel = (key: string) => (key === "eventType.meal" ? "사료" : key);

function item(overrides: Partial<RoutineItem>): RoutineItem {
  return {
    id: "i1",
    sortOrder: 0,
    eventTypeId: "et_meal",
    presetId: null,
    productId: null,
    productName: null,
    quantity: null,
    unit: null,
    eventType: { key: "meal", label: "eventType.meal", category: "HEALTH", defaultUnit: "g" },
    preset: null,
    product: null,
    ...overrides,
  };
}

describe("routineItemSummary", () => {
  it("uses product name and falls back to the type's default unit", () => {
    expect(
      routineItemSummary(item({ product: { id: "p", name: "로얄캐닌" }, quantity: 10 }), tLabel),
    ).toBe("로얄캐닌 10g");
  });

  it("uses the type label when there is no product and no quantity", () => {
    expect(routineItemSummary(item({}), tLabel)).toBe("사료");
  });

  it("trims decimals", () => {
    expect(routineItemSummary(item({ quantity: 5.5, unit: "ml" }), tLabel)).toBe("사료 5.5ml");
  });
});

describe("routineSummary", () => {
  it("caps the items and counts the rest", () => {
    const routine: Routine = {
      id: "r",
      petId: "pet",
      label: "아침",
      sortOrder: 0,
      items: [item({ quantity: 10 }), item({ id: "i2" }), item({ id: "i3" })],
    };
    expect(routineSummary(routine, tLabel)).toBe("사료 10g · 사료 · +1");
  });
});

describe("buildRoutineEventBodies", () => {
  const routine: Routine = {
    id: "r1",
    petId: "pet",
    label: "아침",
    sortOrder: 0,
    items: [
      item({ id: "a", presetId: "ps_meal", quantity: 10, unit: "g" }),
      item({ id: "b", eventTypeId: "et_water", quantity: 5.5, unit: "ml" }),
    ],
  };

  it("emits items last-first with a shared entryId and per-item dedupeKeys", () => {
    const bodies = buildRoutineEventBodies(routine, "pet", "2026-09-15T00:00:00.000Z", "s");
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({
      eventTypeId: "et_water",
      quantity: 5.5,
      unit: "ml",
      entryId: "entry:s",
      dedupeKey: "routine:pet:r1:s:1",
      source: "QUICK",
    });
    expect(bodies[1]).toMatchObject({
      presetId: "ps_meal",
      quantity: 10,
      entryId: "entry:s",
      dedupeKey: "routine:pet:r1:s:0",
    });
    // 칩이 있으면 타입은 칩에서 따라온다 — 둘 다 보내지 않는다
    expect(bodies[1].eventTypeId).toBeUndefined();
  });

  it("skips entryId for a single item", () => {
    const single: Routine = { ...routine, items: [routine.items[0]] };
    const bodies = buildRoutineEventBodies(single, "pet", "2026-09-15T00:00:00.000Z", "s");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].entryId).toBeUndefined();
  });
});
