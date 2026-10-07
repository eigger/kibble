import { describe, expect, it } from "vitest";
import { quickPetControls, quickPetPanelIds, quickPetTabId } from "./quickPetTabs";

describe("quickPetTabs ids", () => {
  it("gives each pet a stable tab id and two distinct panel ids", () => {
    expect(quickPetTabId("p1")).toBe("quick-pet-tab-p1");
    const ids = quickPetPanelIds("p1");
    expect(ids.timeline).not.toBe(ids.input);
  });

  it("points every tab at the one panel that is rendered (the current pet's)", () => {
    const ids = quickPetPanelIds("p1");
    // 선택/비선택 탭 모두 같은 값 — 호출자는 탭이 아니라 현재 아이로 부른다
    expect(quickPetControls("p1", true)).toBe(`${ids.timeline} ${ids.input}`);
    expect(quickPetControls("p1", false)).toBe(ids.timeline);
  });

  it("omits aria-controls when there is no current pet (loading or error)", () => {
    expect(quickPetControls(null, true)).toBeUndefined();
    expect(quickPetControls(undefined, false)).toBeUndefined();
  });
});
