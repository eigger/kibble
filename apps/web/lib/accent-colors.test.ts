import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT_COLOR, isAccentColor } from "./accent-colors";

describe("isAccentColor", () => {
  it("accepts known accent colors", () => {
    expect(isAccentColor("amber")).toBe(true);
    expect(isAccentColor("terracotta")).toBe(true);
    expect(isAccentColor("blue")).toBe(true);
    expect(isAccentColor("sage")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isAccentColor("green")).toBe(false);
    expect(isAccentColor(null)).toBe(false);
    expect(isAccentColor(undefined)).toBe(false);
  });

  it("defaults to amber", () => {
    expect(DEFAULT_ACCENT_COLOR).toBe("amber");
  });
});
