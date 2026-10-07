import { describe, expect, it } from "vitest";
import { historyEventHref } from "./historyLink";

describe("historyEventHref", () => {
  it("carries the pet and the event to open", () => {
    expect(historyEventHref("pet_1", "evt_9")).toBe("/history?pet=pet_1&highlight=evt_9");
  });

  it("omits the pet when unknown and encodes ids", () => {
    expect(historyEventHref(null, "a b")).toBe("/history?highlight=a+b");
  });
});
