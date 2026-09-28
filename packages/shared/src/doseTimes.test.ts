import { describe, expect, it } from "vitest";
import {
  coerceDoseTime,
  defaultDoseTimes,
  formatDoseTime,
  normalizeDoseTimes,
  pickDoseSlot,
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

describe("pickDoseSlot", () => {
  const times = ["08:00", "19:00"];

  it("picks the empty slot nearest to the record time", () => {
    expect(pickDoseSlot(times, [], new Date("2026-09-01T09:10:00+09:00"))).toBe(0);
    expect(pickDoseSlot(times, [], new Date("2026-09-01T18:00:00+09:00"))).toBe(1);
  });

  it("leaves a missed morning slot empty when recording in the evening", () => {
    expect(pickDoseSlot(times, [], new Date("2026-09-01T20:30:00+09:00"))).toBe(1);
  });

  it("skips filled slots", () => {
    expect(pickDoseSlot(times, [1], new Date("2026-09-01T20:30:00+09:00"))).toBe(0);
  });

  it("prefers the earlier slot on a tie", () => {
    expect(pickDoseSlot(["08:00", "10:00"], [], new Date("2026-09-01T09:00:00+09:00"))).toBe(0);
  });

  it("returns null when every slot is filled", () => {
    expect(pickDoseSlot(times, [0, 1], new Date("2026-09-01T12:00:00+09:00"))).toBeNull();
  });
});
