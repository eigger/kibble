import { describe, expect, it } from "vitest";
import {
  encodeProductNameValue,
  eventDetailTagGroupsFor,
  findEventDetailTag,
  formatProductNameDisplay,
  parseProductNameValue,
  productNameFieldLabelKey,
  resolveEventTagLabel,
  toggleProductNameTag,
} from "./eventDetailTags";

const t = (key: string) => {
  const map: Record<string, string> = {
    "eventTag.vomit.hairball": "헤어볼",
    "eventTag.vomit.blood": "혈토",
  };
  return map[key] ?? key;
};

describe("eventDetailTags", () => {
  it("resolves known tag slugs to labels", () => {
    expect(resolveEventTagLabel("vomit", "hairball", t)).toBe("헤어볼");
  });

  it("passes through custom text", () => {
    expect(resolveEventTagLabel("meal", "로얄캐닌", t)).toBe("로얄캐닌");
    expect(resolveEventTagLabel("vomit", "노란토", t)).toBe("노란토");
  });

  it("finds tag by id", () => {
    expect(findEventDetailTag("vomit", "hairball")?.id).toBe("hairball");
    expect(findEventDetailTag("vomit", "헤어볼")).toBeUndefined();
  });

  it("parses and encodes multiple tags", () => {
    expect(parseProductNameValue("vomit", "hairball,blood")).toEqual({
      tagIds: ["hairball", "blood"],
      custom: "",
    });
    expect(encodeProductNameValue("vomit", ["hairball", "blood"], "")).toBe("hairball,blood");
    expect(formatProductNameDisplay("vomit", "hairball,blood", t)).toBe("헤어볼 · 혈토");
  });

  it("keeps custom text alongside tags", () => {
    expect(parseProductNameValue("vomit", "hairball,거품")).toEqual({
      tagIds: ["hairball"],
      custom: "거품",
    });
    expect(encodeProductNameValue("vomit", ["hairball"], "거품")).toBe("hairball,거품");
    expect(formatProductNameDisplay("vomit", "hairball,거품", t)).toBe("헤어볼 · 거품");
  });

  it("reads the renamed ear_smell slug as smell", () => {
    expect(parseProductNameValue("observation", "ear_smell,cough")).toEqual({
      tagIds: ["smell", "cough"],
      custom: "",
    });
    // 다른 타입에서는 별칭이 적용되지 않는다
    expect(parseProductNameValue("vomit", "ear_smell").custom).toBe("ear_smell");
  });

  it("groups observation tags into body and behavior, in that order", () => {
    const groups = eventDetailTagGroupsFor("observation");
    expect(groups.map((g) => g.group)).toEqual(["body", "behavior"]);
    expect(groups[0].tags.map((t) => t.id)).toContain("gum_color");
    expect(groups[0].tags.map((t) => t.id)).toContain("complexion");
    expect(groups[1].tags.map((t) => t.id)).toContain("sleep_change");
  });

  it("returns one ungrouped bucket for types without groups", () => {
    expect(eventDetailTagGroupsFor("vomit")).toHaveLength(1);
    expect(eventDetailTagGroupsFor("vomit")[0].group).toBeNull();
    expect(eventDetailTagGroupsFor("meal")).toEqual([]);
  });

  it("groups care tags into body, toilet, and environment (§7.20, §7.21)", () => {
    const groups = eventDetailTagGroupsFor("care");
    expect(groups.map((g) => g.group)).toEqual(["body", "toilet", "environment"]);
    expect(groups[0].tags[0].id).toBe("dental");
    expect(groups[1].tags.map((t) => t.id)).toEqual([
      "toilet_clean",
      "litter_topup",
      "litter_change",
      "pad_change",
      "toilet_wash",
    ]);
    expect(groups[2].tags.map((t) => t.id)).toEqual(["water_change", "dish_wash", "furniture_move"]);
  });

  it("filters species-specific toilet tags in the picker only", () => {
    const cat = eventDetailTagGroupsFor("care", "CAT")[1].tags.map((t) => t.id);
    expect(cat).toContain("litter_change");
    expect(cat).not.toContain("pad_change");

    const dog = eventDetailTagGroupsFor("care", "DOG")[1].tags.map((t) => t.id);
    expect(dog).toContain("pad_change");
    expect(dog).not.toContain("litter_change");
    expect(dog).not.toContain("litter_topup");

    // 기타 종·미상은 전부 보인다
    expect(eventDetailTagGroupsFor("care", "OTHER")[1].tags).toHaveLength(5);
    expect(eventDetailTagGroupsFor("care", null)[1].tags).toHaveLength(5);

    // 저장된 slug는 종과 무관하게 읽는다 (K-13) — 개 기록에 모래 갈이가 있어도 raw slug가 아니다
    expect(parseProductNameValue("care", "litter_change").tagIds).toEqual(["litter_change"]);
  });

  it("care tags round-trip", () => {
    expect(parseProductNameValue("care", "dental,bath")).toEqual({
      tagIds: ["dental", "bath"],
      custom: "",
    });
    expect(encodeProductNameValue("care", ["dental", "bath"], "")).toBe("dental,bath");
  });
});

describe("eventDetailTags — 체온 측정 방법 (§7.23)", () => {
  it("방법 4개, 묶음 소제목 없음, 전 종 공통", () => {
    const groups = eventDetailTagGroupsFor("temperature", "CAT");
    expect(groups).toHaveLength(1);
    expect(groups[0].group).toBeNull();
    expect(groups[0].tags.map((tag) => tag.id)).toEqual(["rectal", "ear", "axillary", "infrared"]);
    expect(eventDetailTagGroupsFor("temperature", "DOG")[0].tags).toHaveLength(4);
  });

  it("하나만 고른다 — 다른 방법을 누르면 바뀐다, 같은 걸 누르면 풀린다", () => {
    expect(toggleProductNameTag("temperature", [], "rectal")).toEqual(["rectal"]);
    expect(toggleProductNameTag("temperature", ["rectal"], "ear")).toEqual(["ear"]);
    expect(toggleProductNameTag("temperature", ["ear"], "ear")).toEqual([]);
    // 관리는 여전히 여러 개
    expect(toggleProductNameTag("care", ["dental"], "bath")).toEqual(["dental", "bath"]);
  });

  it("라벨 키와 저장 형식", () => {
    expect(productNameFieldLabelKey("temperature")).toBe("eventDetailTemperatureMethod");
    expect(encodeProductNameValue("temperature", ["ear"], "")).toBe("ear");
    expect(parseProductNameValue("temperature", "ear")).toEqual({ tagIds: ["ear"], custom: "" });
  });
});
