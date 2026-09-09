import { describe, expect, it } from "vitest";
import { startOfTodayBoundary } from "./kstClock.js";
import { todaySummaryForPet } from "./todaySummary.js";

describe("startOfTodayBoundary", () => {
  it("uses KST midnight (UTC+9), not UTC midnight", () => {
    const now = new Date("2026-08-31T22:00:00.000Z");
    const since = startOfTodayBoundary(now);
    expect(since.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(now.getTime()).toBeGreaterThanOrEqual(since.getTime());
  });
});

const EVENT_TYPES = [
  {
    id: "type_meal",
    key: "meal",
    label: "eventType.meal",
    category: "FEEDING",
    scaleType: null,
    defaultUnit: "g",
    sortOrder: 0,
  },
  {
    id: "type_water",
    key: "water",
    label: "eventType.water",
    category: "FEEDING",
    scaleType: null,
    defaultUnit: "ml",
    sortOrder: 1,
  },
  {
    id: "type_feces",
    key: "feces",
    label: "eventType.feces",
    category: "EXCRETION",
    scaleType: "FECAL_7",
    defaultUnit: null,
    sortOrder: 2,
  },
];

function fakeDb(options: {
  grouped: unknown[];
  scaleEvents?: { eventTypeId: string; scaleValue: number | null }[];
}) {
  return {
    event: {
      groupBy: async () => options.grouped,
      findMany: async () => options.scaleEvents ?? [],
    },
    eventType: {
      findMany: async () => EVENT_TYPES,
    },
  } as never;
}

describe("todaySummaryForPet", () => {
  it("sums amounts per unit and keeps the latest time, ordered by sortOrder", async () => {
    const db = fakeDb({
      grouped: [
        {
          eventTypeId: "type_water",
          unit: "ml",
          _count: { _all: 2 },
          _sum: { quantity: 250, quantityOffered: null },
          _max: { occurredAt: new Date("2026-09-09T02:00:00.000Z") },
        },
        {
          eventTypeId: "type_meal",
          unit: "g",
          _count: { _all: 3 },
          _sum: { quantity: 90, quantityOffered: 120 },
          _max: { occurredAt: new Date("2026-09-09T04:00:00.000Z") },
        },
      ],
    });

    const rows = await todaySummaryForPet(db, "hh_1", "pet_1");

    expect(rows.map((row) => row.eventTypeKey)).toEqual(["meal", "water"]);
    expect(rows[0]).toEqual({
      eventTypeKey: "meal",
      label: "eventType.meal",
      category: "FEEDING",
      scaleType: null,
      defaultUnit: "g",
      count: 3,
      totals: [{ unit: "g", count: 3, quantity: 90, quantityOffered: 120 }],
      lastOccurredAt: "2026-09-09T04:00:00.000Z",
      lastScaleValue: null,
    });
    expect(rows[1].totals).toEqual([{ unit: "ml", count: 2, quantity: 250, quantityOffered: null }]);
  });

  it("keeps mixed units apart instead of adding them together", async () => {
    const db = fakeDb({
      grouped: [
        {
          eventTypeId: "type_meal",
          unit: "g",
          _count: { _all: 1 },
          _sum: { quantity: 40, quantityOffered: 40 },
          _max: { occurredAt: new Date("2026-09-09T01:00:00.000Z") },
        },
        {
          eventTypeId: "type_meal",
          unit: "개",
          _count: { _all: 2 },
          _sum: { quantity: 3, quantityOffered: null },
          _max: { occurredAt: new Date("2026-09-09T05:00:00.000Z") },
        },
      ],
    });

    const rows = await todaySummaryForPet(db, "hh_1", "pet_1");

    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
    // 건수가 많은 단위가 앞에 온다
    expect(rows[0].totals.map((total) => total.unit)).toEqual(["개", "g"]);
    expect(rows[0].lastOccurredAt).toBe("2026-09-09T05:00:00.000Z");
  });

  it("folds a missing unit into the type's default unit", async () => {
    // 자동 입력은 단위를 안 보내고 화면 입력은 항상 defaultUnit을 붙인다 —
    // 둘을 다른 단위로 두면 섞인 날 합계가 통째로 횟수로 떨어진다.
    const db = fakeDb({
      grouped: [
        {
          eventTypeId: "type_water",
          unit: null,
          _count: { _all: 1 },
          _sum: { quantity: 250, quantityOffered: null },
          _max: { occurredAt: new Date("2026-09-09T01:00:00.000Z") },
        },
        {
          eventTypeId: "type_water",
          unit: "ml",
          _count: { _all: 2 },
          _sum: { quantity: 300, quantityOffered: null },
          _max: { occurredAt: new Date("2026-09-09T06:00:00.000Z") },
        },
      ],
    });

    const rows = await todaySummaryForPet(db, "hh_1", "pet_1");

    expect(rows[0].totals).toEqual([
      { unit: "ml", count: 3, quantity: 550, quantityOffered: null },
    ]);
    expect(rows[0].lastOccurredAt).toBe("2026-09-09T06:00:00.000Z");
  });

  it("keeps a null unit as null when the type has no default", async () => {
    const db = fakeDb({
      grouped: [
        {
          eventTypeId: "type_feces",
          unit: null,
          _count: { _all: 2 },
          _sum: { quantity: null, quantityOffered: null },
          _max: { occurredAt: new Date("2026-09-09T03:00:00.000Z") },
        },
      ],
    });

    const rows = await todaySummaryForPet(db, "hh_1", "pet_1");
    expect(rows[0].totals[0].unit).toBeNull();
  });

  it("takes the most recent scale value for the type", async () => {
    const db = fakeDb({
      grouped: [
        {
          eventTypeId: "type_feces",
          unit: null,
          _count: { _all: 2 },
          _sum: { quantity: null, quantityOffered: null },
          _max: { occurredAt: new Date("2026-09-09T03:00:00.000Z") },
        },
      ],
      scaleEvents: [
        { eventTypeId: "type_feces", scaleValue: 5 },
        { eventTypeId: "type_feces", scaleValue: 3 },
      ],
    });

    const rows = await todaySummaryForPet(db, "hh_1", "pet_1");

    expect(rows[0].lastScaleValue).toBe(5);
    expect(rows[0].scaleType).toBe("FECAL_7");
    expect(rows[0].totals).toEqual([
      { unit: null, count: 2, quantity: null, quantityOffered: null },
    ]);
  });

  it("returns nothing when the day has no events", async () => {
    expect(await todaySummaryForPet(fakeDb({ grouped: [] }), "hh_1", "pet_1")).toEqual([]);
  });
});
