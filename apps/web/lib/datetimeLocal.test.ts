import { describe, expect, it } from "vitest";
import { fromDatetimeLocalValue, parseOptionalNumber, toDatetimeLocalValue } from "./datetimeLocal.js";

describe("datetimeLocal (KST wall clock)", () => {
  it("round-trips KST wall time", () => {
    const iso = "2026-09-01T10:00:00.000Z"; // KST 19:00
    const local = toDatetimeLocalValue(iso);
    expect(local).toBe("2026-09-01T19:00");
    expect(fromDatetimeLocalValue(local)).toBe(iso);
  });

  it("rejects empty datetime", () => {
    expect(fromDatetimeLocalValue("")).toBeNull();
    expect(fromDatetimeLocalValue("   ")).toBeNull();
  });

  it("rejects malformed datetime", () => {
    expect(fromDatetimeLocalValue("not-a-date")).toBeNull();
  });
});

describe("parseOptionalNumber", () => {
  it("accepts empty as null", () => {
    expect(parseOptionalNumber("")).toEqual({ ok: true, value: null });
  });

  it("rejects non-numeric", () => {
    expect(parseOptionalNumber("abc").ok).toBe(false);
  });
});
