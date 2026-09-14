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

describe("parseEntryText — 체온 (§7.23)", () => {
  const withTemperature = [
    ...targets,
    {
      eventTypeId: "temperature-id",
      eventTypeKey: "temperature",
      label: "eventType.temperature",
      aliases: ["체온", "열"],
      presetId: "preset-temperature",
      defaultUnit: "°C",
      sortOrder: 85,
    },
  ];

  it("단위만 있어도 체온이다 — 38.5도 / 38.5℃ / 38.5°C", () => {
    for (const text of ["38.5도", "38.5℃", "38.5°C"]) {
      const [line] = parseEntryText(text, withTemperature, "note-id");
      expect(line?.eventTypeKey).toBe("temperature");
      expect(line?.quantity).toBe(38.5);
      expect(line?.unit).toBe("°C");
      expect(line?.note).toBeNull();
    }
  });

  it("별칭 + 단위 없는 숫자 — 체온 38.5", () => {
    const [line] = parseEntryText("체온 38.5", withTemperature, "note-id");
    expect(line?.eventTypeKey).toBe("temperature");
    expect(line?.quantity).toBe(38.5);
    expect(line?.unit).toBe("°C");
    expect(line?.note).toBeNull();
  });

  it("시각은 값으로 읽지 않는다 — 8시 체온 39.1", () => {
    const [line] = parseEntryText("8시 체온 39.1", withTemperature, "note-id");
    expect(line?.eventTypeKey).toBe("temperature");
    expect(line?.quantity).toBe(39.1);
    expect(line?.occurredAt).not.toBeNull();
  });

  it("체온 모양이 아닌 숫자는 값으로 읽지 않는다 — 열 10일째", () => {
    const [line] = parseEntryText("열 10일째", withTemperature, "note-id");
    expect(line?.eventTypeKey).toBe("temperature");
    expect(line?.quantity).toBeNull();
    expect(line?.note).toBe("10일째");
  });

  it("체온 타입이 없는 가구에서는 메모로 떨어진다 (K-12)", () => {
    const [line] = parseEntryText("38.5도", targets, "note-id");
    expect(line?.eventTypeKey).toBe("note");
    expect(line?.quantity).toBe(38.5);
  });

  it("사료 40g정도는 여전히 사료 40g이다", () => {
    const [line] = parseEntryText("사료 40g정도", withTemperature, "note-id");
    expect(line?.eventTypeKey).toBe("meal");
    expect(line?.quantity).toBe(40);
    expect(line?.unit).toBe("g");
  });
});
