import { describe, expect, it } from "vitest";
import { bumpJournalStats, journalInsightMessage, type JournalStats } from "./journalInsight.js";

const t = (key: string, vars?: Record<string, string>) =>
  vars ? `${key}:${vars.days ?? ""}` : key;

describe("journalInsightMessage", () => {
  it("returns null when empty", () => {
    expect(journalInsightMessage({ totalEventCount: 0, distinctDayCount: 0 }, t)).toBeNull();
  });

  it("shows first-entry copy once", () => {
    expect(journalInsightMessage({ totalEventCount: 1, distinctDayCount: 1 }, t)).toBe(
      "homeJournalInsightFirst",
    );
  });

  it("shows progress for day 2", () => {
    expect(journalInsightMessage({ totalEventCount: 5, distinctDayCount: 2 }, t)).toBe(
      "homeJournalInsightProgress:2",
    );
  });

  it("shows milestone only on exactly day 3", () => {
    expect(journalInsightMessage({ totalEventCount: 10, distinctDayCount: 3 }, t)).toBe(
      "homeJournalInsightTrends",
    );
    expect(journalInsightMessage({ totalEventCount: 100, distinctDayCount: 4 }, t)).toBeNull();
  });
});

describe("bumpJournalStats", () => {
  const base: JournalStats = { totalEventCount: 50, distinctDayCount: 4 };

  it("does not change distinct days when already capped", () => {
    expect(
      bumpJournalStats(base, "2026-09-02T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
    ).toEqual({ totalEventCount: 51, distinctDayCount: 4 });
  });

  it("does not inflate distinct days from recent-30 recalculation", () => {
    const prev: JournalStats = { totalEventCount: 200, distinctDayCount: 3 };
    expect(
      bumpJournalStats(prev, "2026-09-03T01:00:00.000Z", "2026-09-03T00:00:00.000Z"),
    ).toEqual({ totalEventCount: 201, distinctDayCount: 3 });
  });

  it("increments distinct days only when KST day is new", () => {
    const prev: JournalStats = { totalEventCount: 2, distinctDayCount: 2 };
    expect(
      bumpJournalStats(prev, "2026-09-02T15:00:00.000Z", "2026-09-01T10:00:00.000Z"),
    ).toEqual({ totalEventCount: 3, distinctDayCount: 3 });
  });

  it("starts at one day on first event", () => {
    expect(bumpJournalStats({ totalEventCount: 0, distinctDayCount: 0 }, "2026-09-01T00:00:00.000Z", null)).toEqual({
      totalEventCount: 1,
      distinctDayCount: 1,
    });
  });
});
