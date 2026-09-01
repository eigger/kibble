import { describe, expect, it } from "vitest";
import { dedupeAliases } from "./aliasUtils.js";

describe("dedupeAliases", () => {
  it("removes empty and duplicate entries", () => {
    expect(dedupeAliases([" 밥 ", "밥", "물", ""])).toEqual(["밥", "물"]);
  });
});
