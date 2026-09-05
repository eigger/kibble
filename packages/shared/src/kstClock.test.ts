import { describe, expect, it } from "vitest";
import { kstDayDiff, kstDayKey } from "./kstClock.js";

describe("kstDayDiff", () => {
  it("returns 0 for the same date in KST", () => {
    const base = new Date("2026-09-05T03:00:00.000Z"); // 12:00 KST
    const target = new Date("2026-09-05T10:00:00.000Z"); // 19:00 KST
    expect(kstDayDiff(target, base)).toBe(0);
  });

  it("returns positive days for future dates", () => {
    const base = new Date("2026-09-05T00:00:00.000Z"); // 09:00 KST
    const tomorrow = new Date("2026-09-06T00:00:00.000Z"); // 09:00 KST next day
    const thirtyDaysLater = new Date("2026-10-05T00:00:00.000Z");
    expect(kstDayDiff(tomorrow, base)).toBe(1);
    expect(kstDayDiff(thirtyDaysLater, base)).toBe(30);
  });

  it("returns negative days for past dates", () => {
    const base = new Date("2026-09-05T00:00:00.000Z");
    const yesterday = new Date("2026-09-04T00:00:00.000Z");
    const tenDaysAgo = new Date("2026-08-26T00:00:00.000Z");
    expect(kstDayDiff(yesterday, base)).toBe(-1);
    expect(kstDayDiff(tenDaysAgo, base)).toBe(-10);
  });

  describe("KST midnight boundaries (UTC+9)", () => {
    it("recognizes day change across 15:00 UTC (00:00 KST next day)", () => {
      // 2026-09-05 23:59:59 KST = 2026-09-05 14:59:59 UTC
      const baseLateNight = new Date("2026-09-05T14:59:59.000Z");
      // 2026-09-06 00:00:01 KST = 2026-09-05 15:00:01 UTC
      const targetJustAfterMidnight = new Date("2026-09-05T15:00:01.000Z");

      expect(kstDayKey(baseLateNight)).toBe("2026-09-05");
      expect(kstDayKey(targetJustAfterMidnight)).toBe("2026-09-06");
      expect(kstDayDiff(targetJustAfterMidnight, baseLateNight)).toBe(1);
    });

    it("treats times within the same KST day as 0 even across UTC day change", () => {
      // 2026-09-05 00:00:01 KST = 2026-09-04 15:00:01 UTC
      const kstStart = new Date("2026-09-04T15:00:01.000Z");
      // 2026-09-05 23:59:59 KST = 2026-09-05 14:59:59 UTC
      const kstEnd = new Date("2026-09-05T14:59:59.000Z");

      expect(kstDayKey(kstStart)).toBe("2026-09-05");
      expect(kstDayKey(kstEnd)).toBe("2026-09-05");
      expect(kstDayDiff(kstEnd, kstStart)).toBe(0);
    });

    it("handles month and leap year boundaries correctly", () => {
      // Leap year 2024: Feb 28 to Mar 1 = 2 days (Feb 29 exists)
      const feb28_2024 = new Date("2024-02-28T00:00:00.000Z");
      const mar01_2024 = new Date("2024-03-01T00:00:00.000Z");
      expect(kstDayDiff(mar01_2024, feb28_2024)).toBe(2);

      // Non-leap year 2023: Feb 28 to Mar 1 = 1 day
      const feb28_2023 = new Date("2023-02-28T00:00:00.000Z");
      const mar01_2023 = new Date("2023-03-01T00:00:00.000Z");
      expect(kstDayDiff(mar01_2023, feb28_2023)).toBe(1);
    });
  });
});
