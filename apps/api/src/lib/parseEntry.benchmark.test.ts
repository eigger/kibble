import { describe, expect, it } from "vitest";
import { SYSTEM_EVENT_TYPES } from "./seed/systemEventTypes.js";
import { parseEntryText, type ParseMatchTarget } from "./parseEntry.js";
import { kstDateTime } from "./kstClock.js";

const NOTE_ID = "type_note";

/** KST 2026-09-01 12:00 */
const NOW = new Date("2026-09-01T03:00:00.000Z");

function benchTargets(): ParseMatchTarget[] {
  return SYSTEM_EVENT_TYPES.filter((row) => row.key !== "note" && row.key !== "walk")
    .map((row) => ({
      eventTypeId: `id_${row.key}`,
      eventTypeKey: row.key,
      label: row.label,
      aliases: row.key === "vomit" ? [...row.aliases, "토함"] : [...row.aliases],
      sortOrder: row.sortOrder,
      defaultUnit: row.defaultUnit ?? null,
    }));
}

function parseOne(input: string) {
  const rows = parseEntryText(input, benchTargets(), NOTE_ID, NOW);
  expect(rows.length).toBeGreaterThanOrEqual(1);
  return rows;
}

function kstParts(d: Date) {
  const s = new Date(d.getTime() + 9 * 3_600_000);
  return { h: s.getUTCHours(), m: s.getUTCMinutes(), date: s.getUTCDate() };
}

describe("parseEntry benchmark (docs/parsing-benchmark-public.md)", () => {
  describe("time", () => {
    it("T01 8시 40분 사료", () => {
      const [r] = parseOne("8시 40분 사료");
      expect(r!.eventTypeKey).toBe("meal");
      expect(kstParts(r!.occurredAt!)).toEqual({ h: 8, m: 40, date: 1 });
      expect(r!.needsReview).toBe(false);
    });

    it("T02 오후 3시 물", () => {
      const [r] = parseOne("오후 3시 물");
      expect(r!.eventTypeKey).toBe("water");
      expect(kstParts(r!.occurredAt!)).toEqual({ h: 15, m: 0, date: 1 });
      expect(r!.needsReview).toBe(false);
    });

    it("T03 어제 저녁 대변", () => {
      const [r] = parseOne("어제 저녁 대변");
      expect(r!.eventTypeKey).toBe("poop");
      expect(kstParts(r!.occurredAt!)).toEqual({ h: 19, m: 0, date: 31 });
      expect(r!.needsReview).toBe(true);
    });

    it("T04 방금 간식", () => {
      const [r] = parseOne("방금 간식");
      expect(r!.eventTypeKey).toBe("treat");
      expect(r!.occurredAt!.getTime()).toBe(NOW.getTime());
      expect(r!.needsReview).toBe(false);
    });
  });

  describe("quantity", () => {
    it("Q01 사료 40g", () => {
      const [r] = parseOne("사료 40g");
      expect(r!.eventTypeKey).toBe("meal");
      expect(r!.quantity).toBe(40);
      expect(r!.unit).toBe("g");
    });

    it("Q02 100g 줬는데 30g 먹음", () => {
      const [r] = parseOne("100g 줬는데 30g 먹음");
      expect(r!.eventTypeKey).toBe("meal");
      expect(r!.quantityOffered).toBe(100);
      expect(r!.quantity).toBe(30);
      expect(r!.unit).toBe("g");
    });

    it("Q03 물 70~80ml", () => {
      const [r] = parseOne("물 70~80ml");
      expect(r!.eventTypeKey).toBe("water");
      expect(r!.quantity).toBe(75);
      expect(r!.unit).toBe("ml");
      expect(r!.needsReview).toBe(true);
    });

    it("Q03b 물 7~80ml", () => {
      const [r] = parseOne("물 7~80ml");
      expect(r!.quantity).toBe(75);
      expect(r!.needsReview).toBe(true);
    });

    it("Q04 대변 2개", () => {
      const [r] = parseOne("대변 2개");
      expect(r!.eventTypeKey).toBe("poop");
      expect(r!.quantity).toBe(2);
      expect(r!.unit).toBe("개");
    });
  });

  describe("keywords", () => {
    it("K01 밥", () => {
      expect(parseOne("밥")[0]!.eventTypeKey).toBe("meal");
    });
    it("K02 오줌", () => {
      expect(parseOne("오줌")[0]!.eventTypeKey).toBe("pee");
    });
    it("K03 토함", () => {
      expect(parseOne("토함")[0]!.eventTypeKey).toBe("vomit");
    });
    it("K04 3.2kg", () => {
      const [r] = parseOne("3.2kg");
      expect(r!.eventTypeKey).toBe("weight");
      expect(r!.quantity).toBe(3.2);
      expect(r!.unit).toBe("kg");
    });
  });

  describe("composite", () => {
    it("C01 8시 40분 사료 40g정도", () => {
      const [r] = parseOne("8시 40분 사료 40g정도");
      expect(r!.eventTypeKey).toBe("meal");
      expect(r!.quantity).toBe(40);
      expect(kstParts(r!.occurredAt!)).toEqual({ h: 8, m: 40, date: 1 });
      expect(r!.needsReview).toBe(false);
    });

    it("C02 오후 2시 약", () => {
      const [r] = parseOne("오후 2시 약");
      expect(r!.eventTypeKey).toBe("medication");
      expect(kstParts(r!.occurredAt!)).toEqual({ h: 14, m: 0, date: 1 });
    });
  });

  describe("multiline", () => {
    it("M01 three lines", () => {
      const rows = parseEntryText("8시 사료\n9시 물\n10시 대변", benchTargets(), NOTE_ID, NOW);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.eventTypeKey)).toEqual(["meal", "water", "poop"]);
      expect(rows.map((r) => r.lineIndex)).toEqual([0, 1, 2]);
    });

    it("M02 아침 밥 50g / 점심 츄르", () => {
      const rows = parseEntryText("아침 밥 50g\n점심 츄르", benchTargets(), NOTE_ID, NOW);
      expect(rows[0]!.eventTypeKey).toBe("meal");
      expect(rows[0]!.quantity).toBe(50);
      expect(rows[0]!.needsReview).toBe(true);
      expect(rows[1]!.eventTypeKey).toBe("treat");
      expect(rows[1]!.needsReview).toBe(true);
    });
  });

  describe("NOTE fallback", () => {
    it("N01 기분 좋아 보임", () => {
      const [r] = parseOne("기분 좋아 보임");
      expect(r!.eventTypeKey).toBe("note");
      expect(r!.rawLine).toBe("기분 좋아 보임");
      expect(r!.needsReview).toBe(true);
    });

    it("N02 ???", () => {
      const [r] = parseOne("???");
      expect(r!.eventTypeKey).toBe("note");
      expect(r!.needsReview).toBe(true);
    });
  });

  describe("uncertainty", () => {
    it("U01 사료 40g정도", () => {
      const [r] = parseOne("사료 40g정도");
      expect(r!.quantity).toBe(40);
      expect(r!.needsReview).toBe(false);
    });

    it("U02 구토한 것 같음", () => {
      const [r] = parseOne("구토한 것 같음");
      expect(r!.eventTypeKey).toBe("vomit");
      expect(r!.needsReview).toBe(false);
    });

    it("U03 밥이나 간식 줌", () => {
      const [r] = parseOne("밥이나 간식 줌");
      expect(r!.needsReview).toBe(true);
      expect(["meal", "treat"]).toContain(r!.eventTypeKey);
    });
  });

  describe("duplicate lines", () => {
    it("keeps separate suggestions for identical raw lines", () => {
      const rows = parseEntryText("물\n물", benchTargets(), NOTE_ID, NOW);
      expect(rows).toHaveLength(2);
      expect(rows[0]!.lineIndex).toBe(0);
      expect(rows[1]!.lineIndex).toBe(1);
    });
  });
});

describe("kstDateTime", () => {
  it("aligns with today summary boundary", () => {
    const eightAm = kstDateTime(NOW, 8, 40, 0);
    const kst = kstParts(eightAm);
    expect(kst).toEqual({ h: 8, m: 40, date: 1 });
  });
});
