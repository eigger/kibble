import { describe, expect, it } from "vitest";
import { quickPetControls, quickPetPanelIds, quickPetTabId } from "./quickPetTabs";

describe("quickPetTabs ids", () => {
  it("gives each pet a stable tab id and two distinct panel ids", () => {
    expect(quickPetTabId("p1")).toBe("quick-pet-tab-p1");
    const ids = quickPetPanelIds("p1");
    expect(ids.timeline).not.toBe(ids.input);
  });

  it("controls both areas, or only the timeline for read-only viewers", () => {
    const ids = quickPetPanelIds("p1");
    expect(quickPetControls("p1", true)).toBe(`${ids.timeline} ${ids.input}`);
    expect(quickPetControls("p1", false)).toBe(ids.timeline);
  });
});
