import { describe, expect, it } from "vitest";
import { restoredEventBelongsToView } from "./restoreView";

describe("restoredEventBelongsToView", () => {
  it("accepts the same pet and rejects a different one", () => {
    expect(restoredEventBelongsToView("a", "a")).toBe(true);
    expect(restoredEventBelongsToView("a", "b")).toBe(false);
  });

  it("accepts when either side is unknown", () => {
    expect(restoredEventBelongsToView(undefined, "b")).toBe(true);
    expect(restoredEventBelongsToView("a", null)).toBe(true);
  });
});
