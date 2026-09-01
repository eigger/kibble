import { describe, expect, it } from "vitest";
import { parseEntryText, type ParseMatchTarget } from "./parseEntry.js";

const NOTE_ID = "type_note";

const targets: ParseMatchTarget[] = [
  {
    eventTypeId: "type_meal",
    eventTypeKey: "meal",
    label: "eventType.meal",
    aliases: ["밥", "사료", "급여"],
    presetId: "preset_meal",
    defaultUnit: "g",
  },
  {
    eventTypeId: "type_water",
    eventTypeKey: "water",
    label: "eventType.water",
    aliases: ["물", "급수"],
    presetId: "preset_water",
    defaultUnit: "ml",
  },
  {
    eventTypeId: "type_poop",
    eventTypeKey: "poop",
    label: "eventType.poop",
    aliases: ["대변", "응가"],
    presetId: "preset_poop",
  },
];

const now = new Date("2026-09-01T12:00:00+09:00");

describe("parseEntryText", () => {
  it("parses meal with quantity and time", () => {
    const lines = parseEntryText("8시 40분 사료 40g", targets, NOTE_ID, now);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.eventTypeKey).toBe("meal");
    expect(lines[0]!.quantity).toBe(40);
    expect(lines[0]!.unit).toBe("g");
    expect(lines[0]!.occurredAt?.getHours()).toBe(8);
    expect(lines[0]!.occurredAt?.getMinutes()).toBe(40);
  });

  it("splits multiple lines and assigns entry semantics per line", () => {
    const lines = parseEntryText("물\n사료 30g", targets, NOTE_ID, now);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.eventTypeKey).toBe("water");
    expect(lines[1]!.eventTypeKey).toBe("meal");
    expect(lines[1]!.quantity).toBe(30);
  });

  it("falls back to note without throwing", () => {
    const lines = parseEntryText("기분이 좀 이상함", targets, NOTE_ID, now);
    expect(lines[0]!.eventTypeKey).toBe("note");
    expect(lines[0]!.note).toBe("기분이 좀 이상함");
  });

  it("never returns empty for whitespace-only input", () => {
    expect(parseEntryText("  \n  ", targets, NOTE_ID, now)).toEqual([]);
  });
});
