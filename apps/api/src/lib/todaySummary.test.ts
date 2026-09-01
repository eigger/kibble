import { describe, expect, it } from "vitest";
import {
  PHASE1_TODAY_UTC_OFFSET_MINUTES,
  startOfTodayBoundary,
  todaySummaryForPet,
} from "./todaySummary.js";

describe("startOfTodayBoundary", () => {
  it("uses KST midnight (UTC+9), not UTC midnight", () => {
    // 2026-09-01 07:00 KST = 2026-08-31T22:00:00Z — still "today" in KST
    const now = new Date("2026-08-31T22:00:00.000Z");
    const since = startOfTodayBoundary(now);
    expect(since.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(now.getTime()).toBeGreaterThanOrEqual(since.getTime());
  });

  it("excludes events before KST midnight", () => {
    const now = new Date("2026-09-01T00:30:00.000Z"); // 09:30 KST
    const since = startOfTodayBoundary(now);
    expect(since.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    const before = new Date("2026-08-31T14:59:59.999Z"); // 23:59:59 KST previous day
    expect(before.getTime()).toBeLessThan(since.getTime());
  });

  it("defaults to +9 offset constant", () => {
    expect(PHASE1_TODAY_UTC_OFFSET_MINUTES).toBe(540);
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
