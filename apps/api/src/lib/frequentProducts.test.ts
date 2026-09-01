import { describe, expect, it } from "vitest";
import { eventTypeSupportsProductName } from "./frequentProducts.js";

describe("eventTypeSupportsProductName", () => {
  it("includes meal and treat", () => {
    expect(eventTypeSupportsProductName("meal")).toBe(true);
    expect(eventTypeSupportsProductName("treat")).toBe(true);
  });

  it("excludes other types", () => {
    expect(eventTypeSupportsProductName("water")).toBe(false);
    expect(eventTypeSupportsProductName("poop")).toBe(false);
  });
});
