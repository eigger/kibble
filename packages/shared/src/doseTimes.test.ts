import { describe, expect, it } from "vitest";
import {
  coerceDoseTime,
  defaultDoseTimes,
  formatDoseTime,
  normalizeDoseTimes,
  resolveDoseTimeOccurredAt,
} from "./doseTimes.js";

describe("defaultDoseTimes", () => {
  it("maps common daily counts", () => {
    expect(defaultDoseTimes(1)).toEqual(["08:00"]);
    expect(defaultDoseTimes(2)).toEqual(["08:00", "19:00"]);
    expect(defaultDoseTimes(3)).toEqual(["08:00", "12:00", "19:00"]);
  });
});

describe("normalizeDoseTimes", () => {
  it("pads and trims to dosesPerDay", () => {
    expect(normalizeDoseTimes(["19:00", "08:00"], 3)).toEqual([
      "19:00",
      "08:00",
      "19:00",
    ]);
    expect(normalizeDoseTimes(["08:00", "12:00", "19:00", "22:00"], 2)).toEqual([
      "08:00",
      "12:00",
    ]);
  });

  it("converts legacy slot keys by index", () => {
    expect(normalizeDoseTimes(["morning", "evening"], 2)).toEqual(["08:00", "19:00"]);
  });
});

describe("resolveDoseTimeOccurredAt", () => {
  it("uses slot time in KST when already past", () => {
    const now = new Date("2026-09-01T14:00:00+09:00");
    const at = resolveDoseTimeOccurredAt("08:00", now);
    expect(at.getTime()).toBe(new Date("2026-09-01T08:00:00+09:00").getTime());
  });

  it("uses now when slot time is still in the future", () => {
    const now = new Date("2026-09-01T07:30:00+09:00");
    const at = resolveDoseTimeOccurredAt("08:00", now);
    expect(at.getTime()).toBe(now.getTime());
  });
});

describe("formatDoseTime", () => {
  it("formats HH:mm input", () => {
    expect(coerceDoseTime("09:30")).toBe("09:30");
    expect(formatDoseTime("09:30", "ko-KR")).toMatch(/9:30/);
  });
});
