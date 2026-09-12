import { describe, expect, it } from "vitest";
import { parseEntryText } from "./parseEntry.js";
import { CARE_ALIASES } from "./seed/migrateDentalToCare.js";

const targets = [
  {
    eventTypeId: "care-id",
    eventTypeKey: "care",
    label: "eventType.care",
    // 시드와 같은 목록 — 별칭이 늘었는데 태그 표가 안 따라오는 것을 여기서 잡는다
    aliases: CARE_ALIASES,
    presetId: "preset-care",
    defaultUnit: null,
    sortOrder: 8,
  },
  {
    eventTypeId: "meal-id",
    eventTypeKey: "meal",
    label: "eventType.meal",
    aliases: ["밥", "사료"],
    presetId: "preset-meal",
    defaultUnit: "g",
    sortOrder: 0,
  },
];

describe("parseEntryText — keyword tags", () => {
  it("maps a care alias to its detail tag", () => {
    const [line] = parseEntryText("양치", targets, "note-id");
    expect(line?.eventTypeKey).toBe("care");
    expect(line?.productName).toBe("dental");
    expect(line?.note).toBeNull();
  });

  it("maps toilet aliases to their tags (§7.20)", () => {
    const [litter] = parseEntryText("모래갈이", targets, "note-id");
    expect(litter?.eventTypeKey).toBe("care");
    expect(litter?.productName).toBe("litter_change");
    const [pad] = parseEntryText("패드", targets, "note-id");
    expect(pad?.productName).toBe("pad_change");
  });

  it("leaves productName empty for aliases without a tag", () => {
    const [care] = parseEntryText("관리", targets, "note-id");
    expect(care?.productName).toBeNull();
    // "모래"는 보충인지 갈이인지 모른다 — 관리로만
    const [litter] = parseEntryText("모래", targets, "note-id");
    expect(litter?.eventTypeKey).toBe("care");
    expect(litter?.productName).toBeNull();
    const [meal] = parseEntryText("밥 50g", targets, "note-id");
    expect(meal?.eventTypeKey).toBe("meal");
    expect(meal?.productName).toBeNull();
  });
});
