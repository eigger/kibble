import { describe, expect, it, vi } from "vitest";
import { buildRoutineEventBodies, runRoutineEvents, routineItemSummary, routineSummary } from "./routines";
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
    quantityOffered: null,
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

describe("routine meal offered/consumed", () => {
  const routineOf = (items: RoutineItem[]) =>
    ({ id: "r1", petId: "p1", label: "아침", sortOrder: 0, items }) as Routine;

  it("summarises offered / consumed, or whichever exists", () => {
    expect(routineItemSummary(item({ quantity: 8, quantityOffered: 10, unit: "g" }), tLabel)).toBe(
      "사료 10g / 8g",
    );
    expect(routineItemSummary(item({ quantityOffered: 10, unit: "g" }), tLabel)).toBe("사료 10g");
    expect(routineItemSummary(item({ quantity: 8, unit: "g" }), tLabel)).toBe("사료 8g");
  });

  it("names offered and consumed when labels are given", () => {
    const labels = { offered: "제공", consumed: "섭취" };
    expect(
      routineItemSummary(item({ quantity: 8, quantityOffered: 10, unit: "g" }), tLabel, labels),
    ).toBe("사료 제공 10g · 섭취 8g");
    expect(routineItemSummary(item({ quantityOffered: 10, unit: "g" }), tLabel, labels)).toBe(
      "사료 제공 10g",
    );
    // 섭취량만 있는 기존 루틴은 그대로다
    expect(routineItemSummary(item({ quantity: 8, unit: "g" }), tLabel, labels)).toBe("사료 8g");
  });

  it("sends both quantities to the event, but not for medication", () => {
    const meal = item({ quantity: 8, quantityOffered: 10, unit: "g" });
    const { events } = buildRoutineEventBodies(routineOf([meal]), "p1", "2026-10-07T00:00:00.000Z", "s");
    expect(events[0].body.quantity).toBe(8);
    expect(events[0].body.quantityOffered).toBe(10);

    const med = item({
      eventType: { key: "medication", label: "투약", category: "HEALTH", defaultUnit: null },
      quantityOffered: 3,
      medicationCourseId: "c1",
      course: { id: "c1", name: "아침약", ended: false },
    });
    const medEvents = buildRoutineEventBodies(routineOf([med]), "p1", "2026-10-07T00:00:00.000Z", "s").events;
    expect(medEvents[0].body.quantityOffered).toBeUndefined();
  });
});

describe("runRoutineEvents", () => {
  const entry = (id: string): { item: RoutineItem; body: never } => ({
    item: item({ id }),
    body: {} as never,
  });

  it("한 항목이 실패해도 나머지는 계속 저장하고 실패를 모은다", async () => {
    const send = vi.fn(async ({ item: it }: { item: RoutineItem }) => {
      if (it.id === "b") throw new Error("404");
      return { status: "created" as const, event: it.id };
    });
    const out = await runRoutineEvents<string>([entry("a"), entry("b"), entry("c")], send, () => false);
    expect(send).toHaveBeenCalledTimes(3);
    expect(out.created).toEqual(["a", "c"]);
    expect(out.failed.map((f) => f.item.id)).toEqual(["b"]);
  });

  it("이미 기록된 항목은 실패가 아니라 건너뜀으로 센다", async () => {
    const out = await runRoutineEvents<string>(
      [entry("a")],
      async () => {
        throw new Error("409");
      },
      () => true,
    );
    expect(out.alreadyGiven.map((i) => i.id)).toEqual(["a"]);
    expect(out.failed).toEqual([]);
  });
});
