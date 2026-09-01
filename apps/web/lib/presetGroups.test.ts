import { describe, expect, it } from "vitest";
import { groupPresetsByCategory } from "./presetGroups";
import type { Preset } from "./types";

function preset(key: string, category: string, sortOrder: number): Preset {
  return {
    id: key,
    petId: "p1",
    label: `eventType.${key}`,
    isStarter: false,
    sortOrder,
    eventType: { key, scaleType: null, category },
  };
}

describe("groupPresetsByCategory", () => {
  it("groups presets in category order", () => {
    const groups = groupPresetsByCategory([
      preset("vet_visit", "MEDICAL", 7),
      preset("meal", "FEEDING", 0),
      preset("poop", "EXCRETION", 2),
      preset("walk", "ACTIVITY", 5),
    ]);

    expect(groups.map((g) => g.category)).toEqual(["FEEDING", "EXCRETION", "ACTIVITY", "MEDICAL"]);
    expect(groups[0]?.presets.map((p) => p.eventType?.key)).toEqual(["meal"]);
  });
});
