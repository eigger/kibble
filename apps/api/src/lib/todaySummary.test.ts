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

describe("todaySummaryForPet", () => {
  it("groups today's events by type and sorts by sortOrder", async () => {
    const db = {
      event: {
        groupBy: async () => [
          { eventTypeId: "type_water", _count: { _all: 2 } },
          { eventTypeId: "type_meal", _count: { _all: 3 } },
        ],
      },
      eventType: {
        findMany: async () => [
          { id: "type_meal", key: "meal", label: "eventType.meal", sortOrder: 0 },
          { id: "type_water", key: "water", label: "eventType.water", sortOrder: 1 },
        ],
      },
    };

    const rows = await todaySummaryForPet(db as never, "hh_1", "pet_1");
    expect(rows).toEqual([
      { eventTypeKey: "meal", label: "eventType.meal", count: 3 },
      { eventTypeKey: "water", label: "eventType.water", count: 2 },
    ]);
  });
});
