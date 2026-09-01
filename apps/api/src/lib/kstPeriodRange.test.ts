import { describe, expect, it } from "vitest";
import { parseKstPeriodRange, periodRangeFromQuery } from "./kstPeriodRange.js";

describe("parseKstPeriodRange", () => {
  it("parses a KST day", () => {
    const range = parseKstPeriodRange("2026-09-01");
    expect(range).not.toBeNull();
    expect(range!.gte.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(range!.lt.toISOString()).toBe("2026-09-01T15:00:00.000Z");
  });

  it("parses a KST month", () => {
    const range = parseKstPeriodRange("2026-09");
    expect(range).not.toBeNull();
    expect(range!.gte.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(range!.lt.toISOString()).toBe("2026-09-30T15:00:00.000Z");
  });

  it("parses a KST year", () => {
    const range = parseKstPeriodRange("2026");
    expect(range).not.toBeNull();
    expect(range!.gte.toISOString()).toBe("2025-12-31T15:00:00.000Z");
    expect(range!.lt.toISOString()).toBe("2026-12-31T15:00:00.000Z");
  });

  it("rejects invalid dates", () => {
    expect(parseKstPeriodRange("2026-02-31")).toBeNull();
    expect(parseKstPeriodRange("bad")).toBeNull();
  });
});

describe("periodRangeFromQuery", () => {
  it("prefers period over legacy date", () => {
    expect(periodRangeFromQuery({ period: "2026", date: "2026-08-07" })).toEqual(
      parseKstPeriodRange("2026"),
    );
  });
});
