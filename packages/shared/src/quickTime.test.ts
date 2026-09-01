import { describe, expect, it } from "vitest";
import { kstDateTime } from "./kstClock.js";
import { resolveQuickTime } from "./quickTime.js";

describe("resolveQuickTime", () => {
  const now = new Date("2026-09-01T06:00:00.000Z"); // KST 15:00

  it("returns now unchanged", () => {
    expect(resolveQuickTime("now", now).getTime()).toBe(now.getTime());
  });

  it("subtracts one hour", () => {
    expect(resolveQuickTime("oneHourAgo", now).getTime()).toBe(now.getTime() - 3_600_000);
  });

  it("matches parser yesterday evening (19:00 KST)", () => {
    const expected = kstDateTime(now, 19, 0, -1);
    expect(resolveQuickTime("yesterdayEvening", now).toISOString()).toBe(expected.toISOString());
  });
});
