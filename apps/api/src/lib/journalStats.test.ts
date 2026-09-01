import { describe, expect, it } from "vitest";
import { journalStatsForPet } from "./journalStats.js";

describe("journalStatsForPet", () => {
  it("counts total events and distinct KST days", async () => {
    const rows = [
      { occurredAt: new Date("2026-08-31T23:00:00.000Z") },
      { occurredAt: new Date("2026-09-01T11:00:00.000Z") },
      { occurredAt: new Date("2026-09-01T23:30:00.000Z") },
    ];
    const db = {
      event: {
        count: async () => 3,
        findMany: async () => rows,
      },
    };

    const stats = await journalStatsForPet(db as never, "hh", "pet1");
    expect(stats.totalEventCount).toBe(3);
    expect(stats.distinctDayCount).toBe(2);
  });
});
