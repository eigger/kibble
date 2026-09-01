import { describe, expect, it } from "vitest";
import { journalStatsForPet } from "./journalStats.js";

describe("journalStatsForPet", () => {
  it("returns distinct KST day count without scanning all events", async () => {
    const db = {
      event: { count: async () => 3000 },
      $queryRaw: async () => [
        { kst_day: new Date("2026-09-03T00:00:00.000Z") },
        { kst_day: new Date("2026-09-02T00:00:00.000Z") },
      ],
    };

    const stats = await journalStatsForPet(db as never, "hh", "pet1");
    expect(stats.totalEventCount).toBe(3000);
    expect(stats.distinctDayCount).toBe(2);
  });

  it("caps distinct days at probe limit (four or more)", async () => {
    const db = {
      event: { count: async () => 500 },
      $queryRaw: async () => [
        { kst_day: new Date("2026-09-04T00:00:00.000Z") },
        { kst_day: new Date("2026-09-03T00:00:00.000Z") },
        { kst_day: new Date("2026-09-02T00:00:00.000Z") },
        { kst_day: new Date("2026-09-01T00:00:00.000Z") },
      ],
    };

    const stats = await journalStatsForPet(db as never, "hh", "pet1");
    expect(stats.distinctDayCount).toBe(4);
  });

  it("returns exactly three for third-day milestone boundary", async () => {
    const db = {
      event: { count: async () => 12 },
      $queryRaw: async () => [
        { kst_day: new Date("2026-09-03T00:00:00.000Z") },
        { kst_day: new Date("2026-09-02T00:00:00.000Z") },
        { kst_day: new Date("2026-09-01T00:00:00.000Z") },
      ],
    };

    const stats = await journalStatsForPet(db as never, "hh", "pet1");
    expect(stats.distinctDayCount).toBe(3);
  });
});
