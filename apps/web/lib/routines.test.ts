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
    medicationCourseId: null,
    course: null,
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
    const { events, skipped } = buildRoutineEventBodies(
      routine,
      "pet",
      "2026-09-15T00:00:00.000Z",
      "s",
    );
    const bodies = events.map((e) => e.body);
    expect(skipped).toEqual([]);
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
    const bodies = buildRoutineEventBodies(single, "pet", "2026-09-15T00:00:00.000Z", "s").events.map(
      (e) => e.body,
    );
    expect(bodies).toHaveLength(1);
    expect(bodies[0].entryId).toBeUndefined();
  });

  const medType = { key: "medication", label: "eventType.medication", category: "HEALTH", defaultUnit: null };

  it("sends a medication item with its course and no slot, amount or product", () => {
    const withMed: Routine = {
      ...routine,
      items: [
        routine.items[0],
        item({
          id: "m",
          eventTypeId: "et_med",
          eventType: medType,
          quantity: 1,
          productId: "p",
          medicationCourseId: "c1",
          course: { id: "c1", name: "아침약", ended: false },
        }),
      ],
    };
    const { events, skipped } = buildRoutineEventBodies(withMed, "pet", "2026-09-15T00:00:00.000Z", "s");
    expect(skipped).toEqual([]);
    expect(events[0].body).toMatchObject({ eventTypeId: "et_med", medicationCourseId: "c1" });
    expect(events[0].body.doseSlotIndex).toBeUndefined();
    expect(events[0].body.quantity).toBeUndefined();
    expect(events[0].body.productId).toBeUndefined();
  });

  it("skips a medication item whose course ended and keeps the dedupeKey index stable", () => {
    const ended = item({
      id: "m",
      eventTypeId: "et_med",
      eventType: medType,
      medicationCourseId: "c1",
      course: { id: "c1", name: "아침약", ended: true },
    });
    const withEnded: Routine = { ...routine, items: [ended, routine.items[0]] };
    const { events, skipped } = buildRoutineEventBodies(withEnded, "pet", "2026-09-15T00:00:00.000Z", "s");
    expect(skipped).toEqual([ended]);
    expect(events).toHaveLength(1);
    // 하나만 남으면 묶음 id가 없다
    expect(events[0].body).toMatchObject({ presetId: "ps_meal", dedupeKey: "routine:pet:r1:s:1" });
    expect(events[0].body.entryId).toBeUndefined();
  });

  it("uses the course name as the summary of a medication item", () => {
    expect(
      routineItemSummary(
        item({ eventType: medType, course: { id: "c1", name: "아침약", ended: false } }),
        tLabel,
      ),
    ).toBe("아침약");
  });
});
