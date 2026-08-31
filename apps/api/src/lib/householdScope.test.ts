import { describe, expect, it } from "vitest";
import { householdWhere } from "./householdScope.js";

describe("householdWhere", () => {
  it("returns householdId filter object", () => {
    expect(householdWhere("hh_1")).toEqual({ householdId: "hh_1" });
  });
});
