import { describe, expect, it } from "vitest";
import { parseEntryText } from "./parseEntry.js";

const targets = [
  {
    eventTypeId: "care-id",
    eventTypeKey: "care",
    label: "eventType.care",
    aliases: ["관리", "케어", "양치", "목욕", "발톱", "빗질", "귀청소"],
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

  it("leaves productName empty for aliases without a tag", () => {
    const [care] = parseEntryText("관리", targets, "note-id");
    expect(care?.productName).toBeNull();
    const [meal] = parseEntryText("밥 50g", targets, "note-id");
    expect(meal?.eventTypeKey).toBe("meal");
    expect(meal?.productName).toBeNull();
  });
});
